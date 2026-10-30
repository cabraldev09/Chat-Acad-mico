import { isEmail } from "../../helpers/Email";
import { isRelationshipConnection } from "../RelationshipServices/Relationship";
import { subHours } from "date-fns";

import ChatbotNode from "../../models/ChatbotNode";
import Ticket from "../../models/Ticket";
import User from "../../models/User";
import { logger } from "../../utils/logger";
import { robotMayTalk } from "../../helpers/AgentScope";
import ShowTicketService from "../TicketServices/ShowTicketService";
import UpdateTicketService from "../TicketServices/UpdateTicketService";
import ShowWhatsAppService from "../WhatsappService/ShowWhatsAppService";
import SendWhatsAppMessage from "../WbotServices/SendWhatsAppMessage";
import { findAgentForTicket, runAiForTicket } from "../AiServices/RunAiAgent";
import { runAgentGraph } from "../FlowServices/Runner";
import { noteAutomation } from "./AutomationTrace";
import emitTicketUpdate from "../TicketServices/EmitTicketUpdate";
import { runFlowForTicket } from "../FlowServices/Runner";
import { addActivity, changeStage } from "../CrmServices/LeadCore";
import { applyToLead } from "../AiServices/Tools";
import Lead from "../../models/Lead";
import Polo from "../../models/Polo";
import Queue from "../../models/Queue";
import Tag from "../../models/Tag";
import LeadTag from "../../models/LeadTag";
import { safeRequest } from "../../helpers/SafeUrl";
import AutoAssignTicket from "./AutoAssignTicket";
import { isWithinBusinessHours } from "./BusinessHours";
import { Op } from "sequelize";
import { humanHasTicket } from "../../helpers/HumanOwnership";

// Bot messages carry an invisible mark so they can be told apart from agent
// messages (same convention the queue greeting already used).
const MARK = "‎";

const say = async (ticket: Ticket, body: string): Promise<void> => {
  try {
    // a person may have taken the conversation while the robot was thinking: the robot never talks after that
    if (await humanHasTicket(ticket.id)) {
      logger.info(`Automação do ticket ${ticket.id}: resposta descartada, um atendente assumiu a conversa`);
      return;
    }
    await SendWhatsAppMessage({ body: `${MARK}${body}`, ticket, automated: true });
  } catch (err) {
    logger.error(`Automation could not send message: ${err}`);
  }
};

// chatbotNodeId: null = not started, 0 = waiting at root menu,
// >0 = waiting at that menu node, -1 = flow finished for this ticket
const FLOW_DONE = -1;
const ROOT = 0;

const normalize = (s: string): string =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();

const loadChildren = (whatsappId: number, parentId: number | null) =>
  ChatbotNode.findAll({
    where: {
      parentId: parentId === null ? { [Op.is]: null } : parentId,
      whatsappId: { [Op.or]: [whatsappId, null] }
    } as any,
    order: [
      ["position", "ASC"],
      ["id", "ASC"]
    ]
  });

const menuText = (
  intro: string | null | undefined,
  options: ChatbotNode[],
  withBack: boolean
): string => {
  const list = options.map((n, i) => `*${i + 1}* - ${n.title}`).join("\n");
  const back = withBack ? "\n*0* - Voltar" : "";
  return `${intro ? `${intro}\n\n` : ""}${list}${back}`;
};

const finishFlow = (ticket: Ticket) =>
  ticket.update({ chatbotNodeId: FLOW_DONE });

// after an action that does not wait for the person: run the node's first child, or end the flow
const goNext = async (ticket: Ticket, node: ChatbotNode): Promise<void> => {
  const [next] = await loadChildren(ticket.whatsappId, node.id);
  if (next) await runNodeAction(ticket, next);
  else await finishFlow(ticket);
};

const runNodeAction = async (ticket: Ticket, node: ChatbotNode): Promise<void> => {
  const whatsappId = ticket.whatsappId;
  switch (node.action) {
    case "menu": {
      const children = await loadChildren(whatsappId, node.id);
      if (!children.length) {
        if (node.message) await say(ticket, node.message);
        await finishFlow(ticket);
        return;
      }
      await ticket.update({ chatbotNodeId: node.id });
      await say(ticket, menuText(node.message || node.title, children, true));
      return;
    }
    case "queue": {
      if (node.message) await say(ticket, node.message);
      await UpdateTicketService({
        ticketData: { queueId: node.targetId },
        ticketId: ticket.id
      });
      await finishFlow(ticket);
      await AutoAssignTicket(await ShowTicketService(ticket.id));
      return;
    }
    case "user": {
      if (node.message) await say(ticket, node.message);
      const user = node.targetId ? await User.findByPk(node.targetId) : null;
      if (user) {
        await UpdateTicketService({
          ticketData: { userId: user.id, status: "open" },
          ticketId: ticket.id
        });
      }
      await finishFlow(ticket);
      return;
    }
    case "close": {
      if (node.message) await say(ticket, node.message);
      await finishFlow(ticket);
      await UpdateTicketService({
        ticketData: { status: "closed" },
        ticketId: ticket.id
      });
      return;
    }
    case "ai": {
      await ticket.update({ chatbotNodeId: FLOW_DONE, aiActive: true });
      await emitTicketUpdate(ticket.id);
      if (node.message) await say(ticket, node.message);
      return;
    }
    case "ask": {
      // wait for a free-text answer; it is saved to the lead when it arrives
      await ticket.update({ chatbotNodeId: node.id });
      await say(ticket, node.message || node.title);
      return;
    }
    case "polo": {
      const polos = await Polo.findAll({ where: { active: true }, order: [["name", "ASC"]] });
      if (!polos.length) {
        await goNext(ticket, node);
        return;
      }
      await ticket.update({ chatbotNodeId: node.id });
      await say(
        ticket,
        `${node.message || "Qual polo fica mais perto de você?"}\n\n${polos
          .map((p, i) => `*${i + 1}* - ${p.name}${p.city ? ` (${p.city})` : ""}`)
          .join("\n")}`
      );
      return;
    }
    case "stage": {
      const lead = await Lead.findOne({ where: { contactId: ticket.contactId } });
      if (lead && node.targetId) await changeStage(lead.id, node.targetId, null).catch(err => logger.warn(`chatbot stage: ${err}`));
      if (node.message) await say(ticket, node.message);
      await goNext(ticket, node);
      return;
    }
    case "tag": {
      const lead = await Lead.findOne({ where: { contactId: ticket.contactId } });
      const tag = node.targetId ? await Tag.findByPk(node.targetId) : null;
      if (lead && tag) await LeadTag.findOrCreate({ where: { leadId: lead.id, tagId: tag.id }, defaults: { leadId: lead.id, tagId: tag.id } as any });
      if (node.message) await say(ticket, node.message);
      await goNext(ticket, node);
      return;
    }
    case "webhook": {
      // sends what the bot knows to another system (only public https/http addresses)
      if (node.field) {
        // safeRequest checks the address again when it connects and does not follow redirects (a public address that redirects or re-resolves to an internal one is refused)
        await safeRequest({ method: "POST", url: node.field, data: { ticketId: ticket.id, contactId: ticket.contactId, collected: ticket.aiSlots || {} }, timeout: 5000 })
          .catch(err => logger.warn(`chatbot webhook failed: ${err.message}`));
      }
      if (node.message) await say(ticket, node.message);
      await goNext(ticket, node);
      return;
    }
    default: {
      // "message": answer with text and end the flow
      if (node.message) await say(ticket, node.message);
      await finishFlow(ticket);
    }
  }
};

// Returns true when the chatbot flow consumed the message
const runChatbot = async (
  ticket: Ticket,
  body: string,
  greeting: string | undefined
): Promise<boolean> => {
  const whatsappId = ticket.whatsappId;
  const nodeCount = await ChatbotNode.count({
    where: { whatsappId: { [Op.or]: [whatsappId, null] } } as any
  });
  if (!nodeCount || ticket.chatbotNodeId === FLOW_DONE) return false;

  const showRoot = async (prefix = "") => {
    const roots = await loadChildren(whatsappId, null);
    if (!roots.length) {
      await finishFlow(ticket);
      return false;
    }
    await ticket.update({ chatbotNodeId: ROOT });
    await say(
      ticket,
      prefix +
        menuText(greeting || "Olá {{name}}! Como posso ajudar? Escolha uma opção:", roots, false)
    );
    return true;
  };

  if (ticket.chatbotNodeId === null || ticket.chatbotNodeId === undefined) {
    return showRoot();
  }

  const currentId = ticket.chatbotNodeId;

  // the bot asked a question or offered polos: this message is the answer
  if (currentId !== ROOT) {
    const waiting = await ChatbotNode.findByPk(currentId);
    if (waiting?.action === "ask") {
      const field = waiting.field || "nome";
      const value = body.trim().slice(0, 200);
      if (field === "email" && !isEmail(value)) {
        await say(ticket, "Não consegui entender o e-mail. Pode digitar de novo?");
        return true;
      }
      const collected = { ...(ticket.aiSlots || {}), [field]: value };
      await ticket.update({ aiSlots: collected });
      await applyToLead(ticket, collected);
      await goNext(ticket, waiting);
      return true;
    }
    if (waiting?.action === "polo") {
      const polos = await Polo.findAll({ where: { active: true }, order: [["name", "ASC"]] });
      const typed = normalize(body);
      const chosenPolo =
        (/^\d+$/.test(typed) ? polos[Number(typed) - 1] : undefined) ||
        polos.find(p => normalize(p.name) === typed || (p.city && normalize(p.city) === typed));
      if (!chosenPolo) {
        await say(ticket, "Não encontrei esse polo. Responda com o número de um polo da lista.");
        return true;
      }
      const lead = await Lead.findOne({ where: { contactId: ticket.contactId } });
      if (lead) {
        await lead.update({ poloId: chosenPolo.id });
        await addActivity(lead.id, null, "system", `Polo escolhido no atendimento automático: ${chosenPolo.name}`);
      }
      const salesQueue = await Queue.findOne({ where: { poloId: chosenPolo.id, role: "comercial" } });
      if (salesQueue) {
        await UpdateTicketService({ ticketData: { queueId: salesQueue.id }, ticketId: ticket.id });
        await ticket.reload();
      }
      await goNext(ticket, waiting);
      // when nothing follows, the polo's sales team takes the conversation
      if (salesQueue && (await ticket.reload()).chatbotNodeId === FLOW_DONE) {
        await AutoAssignTicket(await ShowTicketService(ticket.id));
      }
      return true;
    }
  }

  const parentId = currentId === ROOT ? null : currentId;
  const options = await loadChildren(whatsappId, parentId);
  const answer = normalize(body);

  if (answer === "0" && currentId !== ROOT) {
    const current = await ChatbotNode.findByPk(currentId);
    if (current && current.parentId) {
      const parent = await ChatbotNode.findByPk(current.parentId);
      if (parent) {
        await runNodeAction(ticket, parent);
        return true;
      }
    }
    return showRoot();
  }

  const index = /^\d+$/.test(answer) ? Number(answer) - 1 : -1;
  const chosen =
    options[index] ||
    options.find(n => normalize(n.title) === answer) ||
    options.find(n =>
      (n.keywords || "")
        .split(",")
        .map(k => normalize(k))
        .filter(Boolean)
        .includes(answer)
    );

  if (!chosen) {
    const text = menuText(null, options, currentId !== ROOT);
    await say(ticket, `Opção inválida. Escolha uma das opções:\n\n${text}`);
    return true;
  }

  await runNodeAction(ticket, chosen);
  return true;
};

// The person may write several short messages in a row: wait until they stop, then answer once.
const aiTimers = new Map<number, NodeJS.Timeout>();
const aiRunning = new Set<number>();

export const cancelAiTimer = (ticketId: number): void => {
  const timer = aiTimers.get(ticketId);
  if (timer) clearTimeout(timer);
  aiTimers.delete(ticketId);
};

const scheduleAi = (ticketId: number, waitSeconds: number): void => {
  const previous = aiTimers.get(ticketId);
  if (previous) clearTimeout(previous);
  aiTimers.set(
    ticketId,
    setTimeout(async () => {
      aiTimers.delete(ticketId);
      if (aiRunning.has(ticketId)) {
        scheduleAi(ticketId, 1);
        return;
      }
      aiRunning.add(ticketId);
      try {
        await runAiForTicket(ticketId, say);
      } catch (err) {
        logger.error(`AI run failed: ${err}`);
        noteAutomation(ticketId, `o agente de IA falhou: ${(err as any)?.message || err}`);
      } finally {
        aiRunning.delete(ticketId);
      }
    }, Math.min(15, Math.max(0, waitSeconds)) * 1000)
  );
};

// Why the robot stayed quiet (or started), one line per message: "o robô não respondeu" is answered by the log, not by guessing
const trace = (ticket: Ticket, what: string): void => {
  logger.info(`Automação do ticket ${ticket.id}: ${what}`);
  noteAutomation(ticket.id, what);
};

const runAi = async (ticket: Ticket): Promise<boolean> => {
  if (!ticket.aiActive) {
    trace(ticket, "agente de IA não entra: a conversa já saiu do agente (aiActive desligado, por exemplo depois de uma transferência)");
    return false;
  }
  const agent = await findAgentForTicket(ticket);
  if (!agent) {
    trace(ticket, `agente de IA não entra: nenhum agente ligado serve esta conversa (fila ${ticket.queueId || "—"}, conexão ${ticket.whatsappId})`);
    return false;
  }
  // an agent built in blocks (with a published graph) talks through the flow engine; the others keep the single prompt
  if (await runAgentGraph(ticket, agent)) {
    trace(ticket, `agente "${agent.name}" (roteiro em blocos) vai responder em ${agent.waitSeconds ?? 4}s`);
    return true;
  }
  trace(ticket, `agente "${agent.name}" sem roteiro publicado: responde pelo modo simples em ${agent.waitSeconds ?? 4}s`);
  scheduleAi(ticket.id, agent.waitSeconds ?? 4);
  return true;
};

// Reminder for people who left the bot hanging at a menu or question (see workers/ChatbotReminder)
export const remindWaiting = async (ticketId: number): Promise<void> => {
  const ticket = await ShowTicketService(ticketId);
  if (ticket.status === "closed" || ticket.userId || !(ticket.chatbotNodeId > 0)) return;
  await ticket.update({ botReminderAt: new Date() });
  await say(ticket, "Ainda está por aí? Responda quando puder e eu continuo de onde paramos. 🙂");
};

const runClassicQueueMenu = async (
  ticket: Ticket,
  body: string,
  whatsappId: number
): Promise<void> => {
  const { queues, greetingMessage } = await ShowWhatsAppService(whatsappId);
  if (ticket.queueId || !queues.length) return;

  if (queues.length === 1) {
    await UpdateTicketService({
      ticketData: { queueId: queues[0].id },
      ticketId: ticket.id
    });
    await AutoAssignTicket(await ShowTicketService(ticket.id));
    return;
  }

  const chosen = queues[+body - 1];
  if (chosen) {
    await UpdateTicketService({
      ticketData: { queueId: chosen.id },
      ticketId: ticket.id
    });
    if (chosen.greetingMessage) await say(ticket, chosen.greetingMessage);
    await AutoAssignTicket(await ShowTicketService(ticket.id));
    return;
  }

  const options = queues.map((q, i) => `*${i + 1}* - ${q.name}`).join("\n");
  await say(ticket, `${greetingMessage}\n${options}`);
};

interface Input {
  ticketId: number;
  body: string;
}

const RunInboundAutomation = async ({ ticketId, body }: Input): Promise<void> => {
  try {
    const ticket = await ShowTicketService(ticketId);
    // groups, communities, channels, the team's chats and personal contacts: no robot answers there, ever
    if (!robotMayTalk(ticket)) {
      const c = (ticket as any).contact;
      trace(
        ticket,
        `nenhum robô responde aqui: ${ticket.isGroup ? "é um grupo" : c?.isStaff ? "o contato está marcado como Equipe" : c?.isPersonal ? "o contato está marcado como Amigo ou pessoal" : "o contato é de um tipo que o robô não atende"}. Em Contatos, mude a relação para Cliente para o agente responder`
      );
      return;
    }
    if (ticket.status === "closed" || ticket.userId) {
      trace(ticket, ticket.userId ? `ninguém do automático responde: a conversa está com o atendente ${ticket.userId}` : "conversa fechada");
      return;
    }
    // the institution's own number belongs to the relationship team: no flow, chatbot, AI agent, greeting or queue menu answers
    // there (the satisfaction survey is read by the system and everything else waits in the queue for a person)
    if (await isRelationshipConnection(ticket.whatsappId)) {
      trace(ticket, `conexão ${ticket.whatsappId} é o número da instituição (Relacionamento): nenhum robô responde nela`);
      return;
    }
    if (ticket.botReminderAt) await ticket.update({ botReminderAt: null });

    const whatsapp = await ShowWhatsAppService(ticket.whatsappId);

    if (!isWithinBusinessHours(whatsapp)) {
      trace(ticket, "fora do horário da conexão");
      // an AI agent answers at any hour: the lead is qualified at night and the handover says when the team answers (Router: next opening,
      // task for the first quarter of an hour). The "out of hours" text is only for numbers with no agent.
      if (ticket.aiActive && (await findAgentForTicket(ticket))) {
        await runAi(ticket);
        return;
      }
      const recently =
        ticket.outOfHoursSentAt && ticket.outOfHoursSentAt > subHours(new Date(), 6);
      if (whatsapp.outOfHoursMessage && !recently) {
        await ticket.update({ outOfHoursSentAt: new Date() });
        await say(ticket, whatsapp.outOfHoursMessage);
      }
      return;
    }

    // the visual flows come first; the old menu and the AI agent only answer when no flow took the message
    if (await runFlowForTicket(ticket, body)) {
      trace(ticket, "um fluxo do Chatbot e fluxos respondeu antes do agente de IA");
      return;
    }
    if (await runChatbot(ticket, body, whatsapp.greetingMessage)) {
      trace(ticket, "o chatbot antigo respondeu antes do agente de IA");
      return;
    }
    if (await runAi(ticket)) return;
    await runClassicQueueMenu(ticket, body, ticket.whatsappId);
  } catch (err) {
    logger.error({ info: "Inbound automation error", err });
  }
};

export default RunInboundAutomation;
