import Lead from "../../models/Lead";
import LeadStage from "../../models/LeadStage";
import LeadTask from "../../models/LeadTask";
import Ticket from "../../models/Ticket";
import TicketEvent from "../../models/TicketEvent";
import AiAgent from "../../models/AiAgent";
import { addActivity, changeStage } from "../CrmServices/LeadCore";
import { logger } from "../../utils/logger";
import dispatchWebhook from "../WebhookServices/DispatchWebhook";
import { slotsOf, missingSlots } from "./Tools";
import { briefIfCommercial } from "../CommercialServices/Brief";
import { HandoffWhy, Routed, WHY_TEXT, routeToCommercial } from "../CommercialServices/Router";

export type HandoffReason = "pedido" | "limite_turnos" | "limite_tokens" | "qualificado" | "sem_resposta" | "desconhecido";

const REASON: Record<HandoffReason, string> = {
  pedido: "o aluno pediu para falar com uma pessoa ou o assunto exige um humano",
  limite_turnos: "a conversa passou do limite de respostas automáticas",
  limite_tokens: "o limite diário de uso da IA foi atingido",
  qualificado: "todos os dados necessários foram coletados",
  sem_resposta: "a IA não conseguiu responder",
  desconhecido: "a pergunta não está na base de conhecimento"
};

const summaryOf = (agent: AiAgent, ticket: Ticket): string => {
  const c = (ticket.aiSlots || {}) as Record<string, string>;
  const known = new Set(slotsOf(agent).map(s => s.key));
  const lines = [
    ...slotsOf(agent).filter(s => c[s.key]).map(s => `• ${s.label}: ${c[s.key]}`),
    // the fields of an AI stage of a flow are the ones of that flow, not of the agent
    ...Object.entries(c).filter(([k, v]) => !known.has(k) && v).map(([k, v]) => `• ${k}: ${v}`)
  ];
  return [ticket.aiSummary, lines.length ? lines.join("\n") : null].filter(Boolean).join("\n");
};

// Passes the conversation to the team with everything the AI learned, so nobody asks again.
const WHY_OF_REASON: Record<HandoffReason, HandoffWhy> = {
  pedido: "human_request", limite_turnos: "limit_turns", limite_tokens: "limit_tokens", qualificado: "proposal", sem_resposta: "error", desconhecido: "unknown"
};

export const handoffToHuman = async (ticketId: number, agent: AiAgent, reason: HandoffReason, question?: string, why?: HandoffWhy): Promise<Routed | null> => {
  const ticket = await Ticket.findByPk(ticketId);
  if (!ticket) return null;
  await ticket.update({ aiActive: false });
  const because: HandoffWhy = why || WHY_OF_REASON[reason];
  // the integrations are told that the agent handed over (and why), so a CRM or a dashboard outside can follow
  await dispatchWebhook("ai.handoff", { ticketId, contactId: ticket.contactId, agentId: agent.id, agent: agent.name, reason, why: because, question: question || null }).catch(err => logger.warn(`ai.handoff webhook not queued: ${err}`));

  const complete = missingSlots(agent, ticket.aiSlots).length === 0;
  const summary = summaryOf(agent, ticket);

  // visible to the team in the conversation history
  await TicketEvent.create({
    ticketId,
    type: "handoff",
    actorId: null,
    note: `Atendimento com IA encerrado (${why ? WHY_TEXT[because] : REASON[reason]}).${question ? `\nPergunta que ficou sem resposta: “${question}”` : ""}${summary ? `\n${summary}` : ""}`.slice(0, 1000)
  } as any).catch(err => logger.warn(`handoff note not saved: ${err}`));

  const lead = await Lead.findOne({ where: { contactId: ticket.contactId } });
  if (lead) {
    await addActivity(lead.id, null, "system", `Atendimento com IA passou para a equipe (${REASON[reason]}).${summary ? `\n${summary}` : ""}`);
    // the commercial agent keeps the column and the tasks by its own rules (never back to "Qualificado"): here only the brief goes
    const commercial = await briefIfCommercial(ticketId, lead).catch(() => false);
    if (complete && !commercial) {
      const stage = await LeadStage.findOne({ where: { name: "Qualificado" } });
      if (stage && lead.stageId !== stage.id) await changeStage(lead.id, stage.id, null).catch(() => undefined);
      if (lead.ownerId) {
        await LeadTask.create({
          leadId: lead.id,
          userId: lead.ownerId,
          type: "outro",
          title: "Continuar o atendimento: a IA já coletou os dados e preparou o resumo",
          dueAt: new Date(Date.now() + 3600000)
        } as any).catch(() => undefined);
      }
    }
  }

  // who takes it: the commercial team of the lead's polo (reserve queue and managers when there is none), warned at once
  return routeToCommercial(ticket, { why: because, lead, city: (ticket.aiSlots as any)?.cidade || null, agentId: agent.id });
};
