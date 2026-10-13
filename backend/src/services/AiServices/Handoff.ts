import Lead from "../../models/Lead";
import LeadStage from "../../models/LeadStage";
import LeadTask from "../../models/LeadTask";
import Queue from "../../models/Queue";
import Ticket from "../../models/Ticket";
import TicketEvent from "../../models/TicketEvent";
import AiAgent from "../../models/AiAgent";
import { addActivity, changeStage } from "../CrmServices/LeadCore";
import UpdateTicketService from "../TicketServices/UpdateTicketService";
import ShowTicketService from "../TicketServices/ShowTicketService";
import AutoAssignTicket from "../AutomationServices/AutoAssignTicket";
import { logger } from "../../utils/logger";
import { slotsOf, missingSlots } from "./Tools";

export type HandoffReason = "pedido" | "limite_turnos" | "limite_tokens" | "qualificado" | "sem_resposta";

const REASON: Record<HandoffReason, string> = {
  pedido: "o aluno pediu para falar com uma pessoa ou o assunto exige um humano",
  limite_turnos: "a conversa passou do limite de respostas automáticas",
  limite_tokens: "o limite diário de uso da IA foi atingido",
  qualificado: "todos os dados necessários foram coletados",
  sem_resposta: "a IA não conseguiu responder"
};

const summaryOf = (agent: AiAgent, ticket: Ticket): string => {
  const c = (ticket.aiSlots || {}) as Record<string, string>;
  const lines = slotsOf(agent)
    .filter(s => c[s.key])
    .map(s => `• ${s.label}: ${c[s.key]}`);
  return [ticket.aiSummary, lines.length ? lines.join("\n") : null].filter(Boolean).join("\n");
};

// Passes the conversation to the team with everything the AI learned, so nobody asks again.
export const handoffToHuman = async (ticketId: number, agent: AiAgent, reason: HandoffReason): Promise<void> => {
  const ticket = await Ticket.findByPk(ticketId);
  if (!ticket) return;
  await ticket.update({ aiActive: false });

  const complete = missingSlots(agent, ticket.aiSlots).length === 0;
  const summary = summaryOf(agent, ticket);

  // visible to the team in the conversation history
  await TicketEvent.create({
    ticketId,
    type: "handoff",
    actorId: null,
    note: `Atendimento com IA encerrado (${REASON[reason]}).${summary ? `\n${summary}` : ""}`.slice(0, 1000)
  } as any).catch(err => logger.warn(`handoff note not saved: ${err}`));

  const lead = await Lead.findOne({ where: { contactId: ticket.contactId } });
  if (lead) {
    await addActivity(lead.id, null, "system", `Atendimento com IA passou para a equipe (${REASON[reason]}).${summary ? `\n${summary}` : ""}`);
    if (complete) {
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

  // the polo of the student decides who answers: the polo's sales queue, then the queue's own distribution rule
  if (lead?.poloId) {
    const queue = await Queue.findOne({ where: { poloId: lead.poloId, role: "comercial" } });
    if (queue && ticket.queueId !== queue.id) {
      await UpdateTicketService({ ticketData: { queueId: queue.id }, ticketId }).catch(err => logger.warn(`handoff queue: ${err}`));
    }
  }
  await AutoAssignTicket(await ShowTicketService(ticketId));
};
