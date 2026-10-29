import AiAgent from "../../models/AiAgent";
import AiLearning from "../../models/AiLearning";
import Ticket from "../../models/Ticket";
import Whatsapp from "../../models/Whatsapp";
import GetDefaultWhatsApp from "../../helpers/GetDefaultWhatsApp";
import { getIO } from "../../libs/socket";
import { logger } from "../../utils/logger";
import SendToContact from "../ChannelServices/SendToContact";
import { resolveOutboundContact } from "../ChannelServices/ResolveOutboundContact";
import { addDocument } from "./Kb";
import dispatchWebhook from "../WebhookServices/DispatchWebhook";

const reviewUrl = () => `${(process.env.FRONTEND_URL || "").replace(/\/$/, "")}/ai-agents`;

// at most 20 notices an hour, so a busy day never floods the owner's WhatsApp
const sent: number[] = [];
const underLimit = (): boolean => {
  const now = Date.now();
  while (sent.length && now - sent[0] > 3600000) sent.shift();
  if (sent.length >= 20) return false;
  sent.push(now);
  return true;
};

// Tells the person who reviews the agent, on WhatsApp. Never blocks the conversation: failures are only logged.
export const notifyOwner = async (agent: AiAgent, text: string): Promise<void> => {
  if (!agent.reviewNumber || !underLimit()) return;
  try {
    const whatsapp = agent.reviewWhatsappId ? await Whatsapp.findByPk(agent.reviewWhatsappId) : await GetDefaultWhatsApp();
    if (!whatsapp || whatsapp.status !== "CONNECTED") return;
    const contact = await resolveOutboundContact(whatsapp, agent.reviewNumber, "Responsável pela IA");
    await SendToContact({ contact, whatsapp, body: text });
  } catch (err) {
    logger.warn(`AI review notice not sent: ${err}`);
  }
};

const emit = (agentId: number) => getIO().emit("aiLearning", { agentId });

// The agent did not know: remember the question until the team answers.
export const captureUnknown = async (agent: AiAgent, ticket: Ticket, question: string, contactName?: string): Promise<AiLearning> => {
  const row = await AiLearning.create({
    agentId: agent.id,
    ticketId: ticket.id,
    contactName: contactName || null,
    question: question.slice(0, 1000),
    status: "aguardando_equipe"
  } as any);
  emit(agent.id);
  await dispatchWebhook("ai.unknown_question", { ticketId: ticket.id, contactId: ticket.contactId, agentId: agent.id, agent: agent.name, question: row.question }).catch(err => logger.warn(`ai.unknown_question webhook not queued: ${err}`));
  await notifyOwner(
    agent,
    `🤖 *${agent.name}* não soube responder${contactName ? ` uma pergunta de ${contactName}` : " uma pergunta"}:\n\n“${row.question}”\n\nA equipe já foi avisada. Quando responderem, eu envio a resposta para você revisar.`
  );
  return row;
};

const unsign = (body: string) => body.replace(/^\*[^*\n]+:\*\n/, "").trim();

// A person of the team answered a conversation the agent handed over: that answer becomes a suggestion to review.
export const captureTeamReply = async (ticket: Ticket, body: string): Promise<void> => {
  const text = unsign(String(body || ""));
  // bot messages carry an invisible mark; very short replies ("ok", "já vi") teach nothing
  if (!text || text.startsWith("‎") || text.length < 8) return;

  const waiting = await AiLearning.findOne({ where: { ticketId: ticket.id, status: "aguardando_equipe" }, order: [["id", "DESC"]] });
  if (waiting) {
    await waiting.update({ suggestedAnswer: text.slice(0, 4000), status: "para_revisar", answerSource: "equipe" });
    emit(waiting.agentId);
    const agent = await AiAgent.findByPk(waiting.agentId);
    if (agent) {
      await notifyOwner(
        agent,
        `🧠 A equipe respondeu a pergunta “${waiting.question}”:\n\n“${text.slice(0, 600)}”\n\nRevise e aprove para o agente aprender: ${reviewUrl()}`
      );
    }
    return;
  }

  // a second message right after the first (people answer in pieces)
  const recent = await AiLearning.findOne({ where: { ticketId: ticket.id, status: "para_revisar", answerSource: "equipe" }, order: [["id", "DESC"]] });
  if (recent && Date.now() - new Date(recent.updatedAt).getTime() < 10 * 60000 && (recent.suggestedAnswer || "").length < 3500) {
    await recent.update({ suggestedAnswer: `${recent.suggestedAnswer}\n${text}`.slice(0, 4000) });
    emit(recent.agentId);
  }
};

interface Approval {
  question?: string;
  answer?: string;
  // true: the answer is sent as it is when the same question comes (no model); false: the agent uses it as knowledge
  asFaq?: boolean;
  shared?: boolean;
}

export const approve = async (row: AiLearning, input: Approval): Promise<AiLearning> => {
  const question = String(input.question ?? row.question).trim();
  const answer = String(input.answer ?? row.suggestedAnswer ?? "").trim();
  if (!question || !answer) throw new Error("ERR_LEARNING_EMPTY");
  const doc = await addDocument({
    title: question,
    content: input.asFaq ? answer : `Pergunta: ${question}\nResposta: ${answer}`,
    kind: input.asFaq ? "faq" : "doc",
    source: "aprendido",
    agentId: input.shared ? null : row.agentId
  });
  await row.update({ question, suggestedAnswer: answer, status: "aprovada", documentId: doc.id, reviewedAt: new Date() });
  emit(row.agentId);
  return row;
};

export const discard = async (row: AiLearning): Promise<AiLearning> => {
  await row.update({ status: "descartada", reviewedAt: new Date() });
  emit(row.agentId);
  return row;
};
