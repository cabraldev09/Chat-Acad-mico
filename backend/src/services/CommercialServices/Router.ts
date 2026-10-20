import { getSetting } from "../../helpers/AppSettings";
import { getBusinessConfig, isBusinessNow } from "../../helpers/BusinessTime";
import { getIO } from "../../libs/socket";
import AgentMetricEvent from "../../models/AgentMetricEvent";
import Lead from "../../models/Lead";
import LeadCommercial from "../../models/LeadCommercial";
import LeadReminderLog from "../../models/LeadReminderLog";
import LeadTask from "../../models/LeadTask";
import Polo from "../../models/Polo";
import Queue from "../../models/Queue";
import Ticket from "../../models/Ticket";
import TicketEvent from "../../models/TicketEvent";
import User from "../../models/User";
import { logger } from "../../utils/logger";
import { pickUserForQueue } from "../AutomationServices/AutoAssignTicket";
import { syncNextFollowUp } from "../CrmServices/FollowUp";
import { addActivity } from "../CrmServices/LeadCore";
import { resolvePoloFor } from "../PoloServices/ResolvePolo";
import UpdateTicketService from "../TicketServices/UpdateTicketService";
import { nextOpening, whenText } from "./Hours";

// WHO TAKES THE CONVERSATION when the AI agent hands it over. One place decides it, in this order, and always writes down what it did:
//   1. the polo of the lead (the city the person told is matched to the polos, ignoring accents and typos);
//   2. the commercial queue of that polo; without one (or without consultants) the reserve queue; without any, the managers;
//   3. a consultant of the queue (the owner of the lead when he belongs to it, else the queue's own rotation);
//   4. the ticket moves, the consultant is warned at once (live notice + task) and the lead is told when the team answers.
// Nothing here talks to the lead: the caller says the message (it knows what was already said).
export const WHY = ["human_request", "proposal", "qualified", "unknown", "limit_turns", "limit_tokens", "error", "complaint", "media", "loop", "tutoring", "secretary", "other"] as const;
export type HandoffWhy = typeof WHY[number];

export const WHY_TEXT: Record<HandoffWhy, string> = {
  human_request: "a pessoa pediu para falar com alguém",
  proposal: "a pessoa quer valores, bolsa ou matrícula: é a hora da proposta",
  qualified: "a pessoa está qualificada (curso, cidade e ingresso definidos) e o agente já tirou as dúvidas",
  unknown: "a pergunta não está na base de conhecimento",
  limit_turns: "a conversa passou do limite de respostas automáticas",
  limit_tokens: "o limite diário de uso da IA foi atingido",
  error: "a IA não conseguiu responder (erro técnico)",
  complaint: "a pessoa demonstrou insatisfação ou falou de pagamento/jurídico",
  media: "a pessoa enviou algo que a IA não consegue ler",
  loop: "a pessoa repetiu o mesmo pedido sem a IA resolver",
  tutoring: "a pessoa precisa da tutoria (plataforma, atividades, provas, prazos)",
  secretary: "a pessoa precisa da secretaria (documentos, declarações, histórico, matrícula)",
  other: "o atendimento precisa de uma pessoa"
};

// what the stage exit of the flow means as a reason
export const WHY_OF_EXIT: Record<string, HandoffWhy> = { human: "human_request", proposta: "proposal", off: "unknown", limit: "limit_turns", tutoria: "tutoring", secretaria: "secretary" };

// the team that takes the conversation: the commercial team (default), the tutoring of the polo, or the secretary (the coordination of the polo)
export type Team = "comercial" | "tutoria" | "coordenacao";
const TEAM_LABEL: Record<Team, string> = { comercial: "Comercial", tutoria: "Tutoria", coordenacao: "Secretaria" };

// what a qualified lead is told when the consultant of the polo takes over (the agent has just answered the last question)
export const QUALIFIED_MESSAGE = "Perfeito, já tenho o que preciso! Vou passar o seu atendimento para o consultor do seu polo, que continua com você e apresenta a melhor condição. 😊";

export interface Routed {
  queueId: number | null;
  queueName: string | null;
  userId: number | null;
  userName: string | null;
  poloId: number | null;
  poloName: string | null;
  // the polo had no commercial queue with consultants: the reserve queue (or the managers) took it
  fallback: boolean;
  // inside the working hours of the company; when not, `whenText` says when the team answers
  within: boolean;
  whenText: string | null;
}

// ---------------------------------------------------------------- polo
export const resolvePolo = async (city?: string | null, state?: string | null): Promise<{ polo: Polo | null; ambiguous: boolean; candidates: Polo[] }> => {
  const r = await resolvePoloFor(city, state);
  return { polo: r.polo, ambiguous: r.status === "ambiguous", candidates: r.candidates };
};

// the polo of the lead: the one already saved, else the one the city points to (saved, so everything after knows it)
export const ensurePolo = async (lead: Lead | null, cityHint?: string | null): Promise<Polo | null> => {
  if (!lead) return null;
  if (lead.poloId) {
    const own = await Polo.findByPk(lead.poloId);
    if (own && own.active !== false) return own;
  }
  const { polo } = await resolvePolo(cityHint || lead.city);
  if (polo) {
    await lead.update({ poloId: polo.id });
    await addActivity(lead.id, null, "system", `Polo definido pela cidade informada: ${polo.name}`).catch(() => undefined);
  }
  return polo;
};

// ---------------------------------------------------------------- queue
const withUsers = [{ model: User, as: "users", attributes: ["id", "name"], required: true }];

const pickQueue = async (poloId: number | null, team: Team = "comercial"): Promise<{ queue: Queue | null; fallback: boolean }> => {
  if (team !== "comercial") {
    // tutoring and secretary: the queue of the polo; without a polo (or without the queue) any queue of that function that has people
    if (poloId) {
      const own = await Queue.findOne({ where: { poloId, role: team }, include: [{ model: User, as: "users", attributes: ["id", "name"], required: false }] });
      if (own) return { queue: own, fallback: false };
    }
    const any = await Queue.findOne({ where: { role: team }, include: withUsers as any, order: [["id", "ASC"]] });
    return { queue: any || null, fallback: true };
  }
  if (poloId) {
    // the conversation stays with the polo, even while nobody works there: only the management is warned (the polo's team is not
    // moved around, and the conversation is not sent to another polo)
    const own = await Queue.findOne({ where: { poloId, role: "comercial" }, include: [{ model: User, as: "users", attributes: ["id", "name"], required: false }] });
    if (own) return { queue: own, fallback: false };
  }
  const reserveId = Number(await getSetting("crm_fallback_queue", "0")) || 0;
  if (reserveId) {
    const reserve = await Queue.findByPk(reserveId, { include: [{ model: User, as: "users", attributes: ["id", "name"] }] });
    if (reserve) return { queue: reserve, fallback: true };
  }
  const any = await Queue.findOne({ where: { role: "comercial" }, include: withUsers as any, order: [["id", "ASC"]] });
  if (any) return { queue: any, fallback: true };
  return { queue: null, fallback: true };
};

// As soon as the lead's polo is known the conversation already sits in that polo's commercial queue and the lead already has a consultant of
// that polo as owner (so the tasks and the handover go to the right person); the AI keeps talking. Nothing is said to the lead and nobody is
// alerted: the live notice is for the handover itself. A conversation a person already took, or a polo with no commercial queue, is left alone.
export const assignToPolo = async (ticket: Ticket, lead: Lead | null, polo: Polo): Promise<void> => {
  try {
    if (ticket.userId) return;
    const { queue, fallback } = await pickQueue(polo.id, "comercial");
    if (!queue || fallback) return;
    if (ticket.queueId !== queue.id) {
      await UpdateTicketService({ ticketData: { queueId: queue.id }, ticketId: ticket.id });
      await TicketEvent.create({ ticketId: ticket.id, type: "transfer", actorId: null, fromQueueId: ticket.queueId || null, toQueueId: queue.id, toUserId: null, note: `Polo definido pelo atendimento com IA: a conversa ficou na fila comercial do polo ${polo.name}.` } as any);
    }
    if (lead) {
      const users: User[] = (queue as any).users || [];
      const mine = !!lead.ownerId && users.some(u => u.id === lead.ownerId);
      if (!mine && users.length) {
        const owner = await pickUserForQueue(queue, true);
        if (owner) {
          await lead.update({ ownerId: owner.id });
          await addActivity(lead.id, null, "system", `Polo ${polo.name} definido pela cidade informada. Responsável: ${owner.name}.`).catch(() => undefined);
        }
      }
    }
  } catch (err) {
    logger.warn(`Early routing to the polo failed: ${err}`);
  }
};

const SLA_KEY = (ticketId: number): string => `handoff:${ticketId}`;

export interface RouteOptions {
  why: HandoffWhy;
  lead?: Lead | null;
  // a polo the person chose inside the flow
  poloId?: number | null;
  // the city the agent knows (when the lead has not been saved with it yet)
  city?: string | null;
  agentId?: number | null;
  // who takes it (default: the commercial team)
  team?: Team;
}

export const routeToCommercial = async (ticket: Ticket, opts: RouteOptions): Promise<Routed> => {
  const lead = opts.lead !== undefined ? opts.lead : await Lead.findOne({ where: { contactId: ticket.contactId } });
  const chosen = opts.poloId ? await Polo.findByPk(opts.poloId) : null;
  if (chosen && lead && lead.poloId !== chosen.id) await lead.update({ poloId: chosen.id });
  const polo = chosen || (await ensurePolo(lead, opts.city));

  const team: Team = opts.team || "comercial";
  const { queue, fallback } = await pickQueue(polo ? polo.id : null, team);
  let user: User | null = null;
  if (queue) {
    const users: User[] = (queue as any).users || [];
    user = (lead?.ownerId && users.find(u => u.id === lead.ownerId)) || (users.length ? await pickUserForQueue(queue, true) : null);
  }

  const business = await getBusinessConfig();
  const within = isBusinessNow(business);
  const when = within ? null : whenText(nextOpening(business));
  const label = polo ? `${TEAM_LABEL[team]} do polo ${polo.name}` : queue ? `fila ${queue.name}` : "sem fila";

  try {
    if (queue) {
      await UpdateTicketService({ ticketData: { queueId: queue.id, ...(user ? { userId: user.id, status: "open" } : { status: "pending" }) }, ticketId: ticket.id });
    }
    await Ticket.update({ aiActive: false, chatbotNodeId: -1, handoffAt: new Date(), handoffReason: opts.why, handoffAlerts: 0, handoffAlertedAt: null as any }, { where: { id: ticket.id } });
    await TicketEvent.create({
      ticketId: ticket.id,
      type: "transfer",
      actorId: null,
      fromQueueId: ticket.queueId || null,
      toQueueId: queue ? queue.id : null,
      toUserId: user ? user.id : null,
      note: `Agente de IA → ${label}${user ? ` (${user.name})` : queue ? " (aguardando alguém da fila)" : ""}${fallback && queue ? " · fila central" : ""}. Motivo: ${WHY_TEXT[opts.why]}.`.slice(0, 480)
    } as any);
  } catch (err) {
    logger.error(`Handoff routing failed: ${err}`);
  }

  const noTeam = !!queue && !user && !fallback;
  // the person who takes it hears about it now (not only when the lead writes again) and gets a task
  try {
    getIO().emit("aiHandoff", {
      ticketId: ticket.id,
      leadId: lead ? lead.id : null,
      name: lead?.name || ticket.contact?.name || "",
      queueId: queue ? queue.id : null,
      userId: user ? user.id : null,
      poloName: polo ? polo.name : null,
      why: opts.why,
      reason: WHY_TEXT[opts.why],
      fallback,
      noTeam,
      noQueue: !queue,
      outside: !within,
      when
    });
    if (lead) {
      const owner = user ? user.id : lead.ownerId || null;
      const key = SLA_KEY(ticket.id);
      if (team === "comercial" && !(await LeadReminderLog.findOne({ where: { leadId: lead.id, key } }))) {
        await LeadReminderLog.create({ leadId: lead.id, key } as any);
        // inside the working hours the team has 15 minutes; outside, the first quarter of an hour of the next working day
        const dueAt = within ? new Date(Date.now() + 15 * 60000) : new Date((nextOpening(business) || new Date(Date.now() + 3600000)).getTime() + 15 * 60000);
        await LeadTask.create({ leadId: lead.id, userId: owner, type: "whatsapp", title: "Atender lead encaminhado pelo agente de IA", dueAt } as any);
        await syncNextFollowUp(lead.id);
      }
      await addActivity(lead.id, null, "system", `Encaminhado pelo agente de IA ao ${label}${user ? ` (${user.name})` : ""}. Motivo: ${WHY_TEXT[opts.why]}.`).catch(() => undefined);
      const state = await LeadCommercial.findOne({ where: { leadId: lead.id }, attributes: ["agentId", "flowId"] });
      await AgentMetricEvent.create({ leadId: lead.id, agentId: opts.agentId || state?.agentId || null, flowId: state?.flowId || null, event: `handoff_${opts.why}`, once: false, meta: JSON.stringify({ polo: polo ? polo.id : null, queue: queue ? queue.id : null, user: user ? user.id : null, fallback }) } as any).catch(() => undefined);
    }
  } catch (err) {
    logger.warn(`Handoff notice failed: ${err}`);
  }

  return {
    queueId: queue ? queue.id : null,
    queueName: queue ? queue.name : null,
    userId: user ? user.id : null,
    userName: user ? user.name : null,
    poloId: polo ? polo.id : null,
    poloName: polo ? polo.name : null,
    fallback,
    within,
    whenText: when
  };
};

// What the lead is told after the handoff when it happened outside the working hours (said once, by the caller)
export const afterHoursNotice = (r: Routed): string | null => (!r.within && r.whenText ? `Nossa equipe retorna ${r.whenText}. Pode deixar sua mensagem aqui que ela já fica para o consultor. 😊` : null);

