import { getSetting } from "../../helpers/AppSettings";
import { getBusinessConfig, isBusinessNow } from "../../helpers/BusinessTime";
import { getIO } from "../../libs/socket";
import AgentMetricEvent from "../../models/AgentMetricEvent";
import Course from "../../models/Course";
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
import ShowTicketService from "../TicketServices/ShowTicketService";
import UpdateTicketService from "../TicketServices/UpdateTicketService";
import Whatsapp from "../../models/Whatsapp";
import { nextOpening, whenText } from "./Hours";
import { syncHandoffTasks } from "../CrmServices/HandoffTasks";
import { areaOfCourse } from "./MecDefaults";

// WHO TAKES THE CONVERSATION when the AI agent hands it over. One place decides it, in this order, and always writes down what it did:
//   1. the polo of the lead (the city the person told is matched to the polos, ignoring accents and typos);
//   2. the commercial queue of that polo; without one (or without consultants) the reserve queue; without any, the managers;
//   3. a consultant of the queue (the owner of the lead when he belongs to it, else the queue's own rotation);
//   4. the ticket moves, the consultant is warned at once (live notice + task) and the lead is told when the team answers.
// Nothing here talks to the lead: the caller says the message (it knows what was already said).
export const WHY = ["human_request", "proposal", "qualified", "objection", "unknown", "limit_turns", "limit_tokens", "error", "complaint", "media", "loop", "tutoring", "secretary", "other"] as const;
export type HandoffWhy = typeof WHY[number];

export const WHY_TEXT: Record<HandoffWhy, string> = {
  human_request: "a pessoa pediu para falar com alguém",
  proposal: "a pessoa quer valores, bolsa ou matrícula: é a hora da proposta",
  objection: "a pessoa levantou várias objeções: o consultor conduz a conversa daqui",
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
export const QUALIFIED_MESSAGE = "Perfeito! Já organizei suas informações e vou encaminhar seu atendimento para um consultor do nosso polo, que vai continuar com você por aqui.";

// What a qualified lead is told when the consultant takes over: warm and specific (name, course, city), and it asks for the best time, which the
// consultant reads (the agent is out of the conversation from here).
export const qualifiedText = async (ticket: Ticket): Promise<string> => {
  try {
    const lead = await Lead.findOne({ where: { contactId: ticket.contactId } });
    // what the person said in THIS conversation comes first (the CRM may still carry the course of an older contact)
    const { loadState } = await import("./Slots");
    const slots = lead ? (await loadState(lead.id)).slots : ({} as Record<string, any>);
    const first = String(slots.fullName || slots.leadName || lead?.name || ticket.contact?.name || "").trim().split(/\s+/)[0];
    const course = String(slots.courseName || "") || (lead?.courseId ? (await Course.findByPk(lead.courseId, { attributes: ["name"] }))?.name : null) || "";
    const where = String(slots.city || lead?.city || "").trim();
    const bolsa = slots.cpf || lead?.cpf ? " e simular a bolsa que você pode ter" : "";
    return `Perfeito${first ? `, ${first}` : ""}! Já organizei suas informações${course ? ` (${course}${where ? ` em ${where}` : ""})` : ""} e vou encaminhar seu atendimento para um consultor do nosso polo, que vai continuar com você por aqui${bolsa}.`;
  } catch (err) {
    return QUALIFIED_MESSAGE;
  }
};

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
  // semipresencial course whose student lives where it cannot be enrolled: where the enrollment is, and the polo of the city
  semipresencial?: { enrollPolo: string; cityPolo: string } | null;
  // registered when a hot lead waits (no consultant free, or outside the working hours)
  priority?: string | null;
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

// ---------------------------------------------------------------- semipresencial enrollment
// Health, engineering and teaching courses are semipresencial, and they are enrolled only at the polos released for it. A lead from another
// polo's city enrolls at the nearest released one (Polo.enrollPoloId); the city's polo stays on the lead as the place of the practical classes.
const SEMIPRESENCIAL_AREAS = ["saude_eng_agro", "educacao_ciencias"];

export const isSemipresencialCourse = async (courseId: number | null | undefined): Promise<boolean> => {
  if (!courseId) return false;
  const course = await Course.findByPk(courseId, { attributes: ["id", "name", "modality"] });
  if (!course) return false;
  if (/semi/i.test(String(course.modality || ""))) return true;
  return SEMIPRESENCIAL_AREAS.includes(await areaOfCourse(course));
};

// the polo where this lead enrolls, given the polo of its city
export const enrollmentPoloFor = async (lead: Lead | null, cityPolo: Polo): Promise<{ polo: Polo; cityPolo: Polo | null }> => {
  if (!lead || cityPolo.enrollsSemipresencial) return { polo: cityPolo, cityPolo: null };
  const { loadState } = await import("./Slots");
  const talked = Number((await loadState(lead.id)).slots.courseId) || null;
  if (!(await isSemipresencialCourse(talked || lead.courseId))) return { polo: cityPolo, cityPolo: null };
  const mapped = cityPolo.enrollPoloId ? await Polo.findByPk(cityPolo.enrollPoloId) : null;
  const target = mapped && mapped.active !== false && mapped.enrollsSemipresencial ? mapped : await Polo.findOne({ where: { enrollsSemipresencial: true, active: true }, order: [["id", "ASC"]] });
  return target ? { polo: target, cityPolo } : { polo: cityPolo, cityPolo: null };
};

// the polo of the city of a lead that already has one saved (poloId is the enrollment polo when the course is semipresencial)
const cityPoloOf = async (lead: Lead): Promise<Polo | null> => {
  const id = lead.practicePoloId || lead.poloId;
  return id ? Polo.findByPk(id) : null;
};

// saves where the lead enrolls and where its city is, and says so on the lead's history; returns the polo that takes the conversation
const settlePolo = async (lead: Lead | null, cityPolo: Polo): Promise<{ polo: Polo; practice: Polo | null }> => {
  const r = await enrollmentPoloFor(lead, cityPolo);
  if (lead) {
    const practiceId = r.cityPolo ? r.cityPolo.id : null;
    if (lead.poloId !== r.polo.id || (lead.practicePoloId || null) !== practiceId) {
      await lead.update({ poloId: r.polo.id, practicePoloId: practiceId });
      if (r.cityPolo) await addActivity(lead.id, null, "system", `Curso semipresencial: a matrícula é no polo ${r.polo.name}. O polo da cidade é ${r.cityPolo.name} (aulas práticas em viabilização).`).catch(() => undefined);
    }
  }
  return { polo: r.polo, practice: r.cityPolo };
};

// the lead's course became known after the polo: the enrollment polo may change now
export const refreshEnrollmentPolo = async (ticket: Ticket, lead: Lead | null): Promise<void> => {
  if (!lead || !lead.courseId) return;
  const city = await cityPoloOf(lead);
  if (city) await assignToPolo(ticket, lead, city);
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
export const assignToPolo = async (ticket: Ticket, lead: Lead | null, cityPolo: Polo): Promise<void> => {
  try {
    if (ticket.userId) return;
    const { polo } = await settlePolo(lead, cityPolo);
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
          const before = lead.ownerId;
          await lead.update({ ownerId: owner.id });
          await syncHandoffTasks(lead.contactId, before).catch(() => undefined);
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
  // the lead keeps the consultant who already served them when that person is on the team (default: yes)
  keepOwner?: boolean;
  // the consultant the lead asked for by name: chosen only when they are on the team that receives the conversation (never outside its scope)
  preferredUserId?: number | null;
}

export const routeToCommercial = async (ticket: Ticket, opts: RouteOptions): Promise<Routed> => {
  const lead = opts.lead !== undefined ? opts.lead : await Lead.findOne({ where: { contactId: ticket.contactId } });
  const chosen = opts.poloId ? await Polo.findByPk(opts.poloId) : null;
  if (chosen && lead && lead.poloId !== chosen.id) await lead.update({ poloId: chosen.id });
  let polo = chosen || (await ensurePolo(lead, opts.city));
  // semipresencial course: the enrollment is at a released polo (a polo a person chose inside a flow is respected)
  let semipresencial: Routed["semipresencial"] = null;
  if (polo && !chosen && lead) {
    const settled = await settlePolo(lead, (await cityPoloOf(lead)) || polo);
    polo = settled.polo;
    if (settled.practice) semipresencial = { enrollPolo: settled.polo.name, cityPolo: settled.practice.name };
  }

  // the reason says who takes it: a student who needs the tutoring or the secretary goes to those queues of the polo, not to sales
  const team: Team = opts.team || (opts.why === "tutoring" ? "tutoria" : opts.why === "secretary" ? "coordenacao" : "comercial");
  const { queue, fallback } = await pickQueue(polo ? polo.id : null, team);
  let user: User | null = null;
  let viaPreferred = false;
  if (queue) {
    const users: User[] = (queue as any).users || [];
    const ownerOfLead = lead?.ownerId && opts.keepOwner !== false ? users.find(u => u.id === lead.ownerId) : null;
    // the lead's owner keeps the conversation only when they have a WhatsApp number to answer from
    const owners = new Set((await Whatsapp.findAll({ where: { ownerId: users.map(u => u.id), channel: "whatsapp" } as any, attributes: ["ownerId"] })).map(w => Number(w.ownerId)));
    // ...unless nobody of the queue has a number (then the lead's owner is as good as anyone)
    const keepOwner = !!ownerOfLead && (owners.has(ownerOfLead.id) || owners.size === 0);
    const preferred = opts.preferredUserId ? users.find(u => u.id === opts.preferredUserId) || null : null;
    viaPreferred = !!preferred;
    user = preferred || (keepOwner && ownerOfLead) || (users.length ? await pickUserForQueue(queue, true) : null);
  }

  const business = await getBusinessConfig();
  const within = isBusinessNow(business);
  const when = within ? null : whenText(nextOpening(business));
  const label = polo ? `${TEAM_LABEL[team]} do polo ${polo.name}` : queue ? `fila ${queue.name}` : "sem fila";
  let priority: string | null = null;

  try {
    if (queue) {
      await UpdateTicketService({ ticketData: { queueId: queue.id, ...(user ? { userId: user.id, status: "open" } : { status: "pending" }) }, ticketId: ticket.id });
    }
    await Ticket.update({ aiActive: false, chatbotNodeId: -1, handoffAt: new Date(), handoffReason: opts.why, handoffAlerts: 0, handoffAlertedAt: null as any }, { where: { id: ticket.id } });
    // the open conversation and the list hear that the agent left (the alert "agente atendendo" goes away)
    try {
      const fresh = await ShowTicketService(String(ticket.id));
      getIO().to(fresh.status).to(String(fresh.id)).to("notification").emit("ticket", { action: "update", ticket: fresh });
    } catch (err) {
      logger.warn(`Ticket update after the handoff was not sent: ${err}`);
    }
    // a hot lead waiting in a queue (or outside the working hours) is registered with priority, so whoever opens the queue sees who comes first
    const hot = lead ? (await LeadCommercial.findOne({ where: { leadId: lead.id }, attributes: ["temperature"] }))?.temperature === "hot" : false;
    priority = hot && (!user || !within) ? "alta" : null;
    await TicketEvent.create({
      ticketId: ticket.id,
      type: "transfer",
      actorId: null,
      fromQueueId: ticket.queueId || null,
      toQueueId: queue ? queue.id : null,
      toUserId: user ? user.id : null,
      note: `Agente de IA → ${label}${user ? ` (${user.name})` : queue ? " (aguardando alguém da fila)" : ""}${fallback && queue ? " · fila central" : ""}. Motivo: ${WHY_TEXT[opts.why]}.${viaPreferred ? " Consultor pedido pelo lead." : ""}${priority ? ` Prioridade ${priority} (lead quente).` : ""}`.slice(0, 480)
    } as any);
  } catch (err) {
    logger.error(`Handoff routing failed: ${err}`);
    if (lead) await AgentMetricEvent.create({ leadId: lead.id, agentId: opts.agentId || null, flowId: null, event: "handoff_routing_failed", once: false, meta: JSON.stringify({ error: String(err).slice(0, 200) }) } as any).catch(() => undefined);
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
      await addActivity(lead.id, null, "system", `Encaminhado pelo agente de IA ao ${label}${user ? ` (${user.name})` : ""}. Motivo: ${WHY_TEXT[opts.why]}.${priority ? ` Prioridade ${priority} (lead quente).` : ""}`).catch(() => undefined);
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
    whenText: when,
    semipresencial,
    priority
  };
};

// What the lead is told after the handoff when it happened outside the working hours (said once, by the caller)
export const afterHoursNotice = (r: Routed): string | null => {
  const parts: string[] = [];
  // no promise about the practical classes: they are being worked out
  if (r.semipresencial) parts.push(`Como esse curso é semipresencial, a matrícula é feita no polo de ${poloLabel(r.semipresencial.enrollPolo)}. Estamos trabalhando para que as aulas práticas aconteçam no polo mais perto de você, e o consultor te explica como fica no seu caso.`);
  if (!r.within && r.whenText) parts.push(`Nossa equipe retorna ${r.whenText}. Pode deixar sua mensagem aqui que ela já fica para o consultor.`);
  return parts.length ? parts.join(" ") : null;
};

// The one thing said after the handoff: the semipresencial rule, the working hours, or that the lead waits in the queue (never "a consultant took it" before
// the backend confirmed who did). The administrator can write the queue and the after-hours messages; {{quando}} and {{polo}} are filled in.
export const afterHandoffNotice = (r: Routed, messages?: { queued?: string; afterHours?: string } | null): string | null => {
  const fill = (t: string): string => t.replace(/\{\{\s*quando\s*\}\}/gi, r.whenText || "").replace(/\{\{\s*polo\s*\}\}/gi, r.poloName ? poloLabel(r.poloName) : "nosso polo");
  const base = afterHoursNotice(r);
  if (!r.within) return messages && messages.afterHours ? fill(messages.afterHours) : base;
  if (!r.userId && r.queueId) {
    const queued = messages && messages.queued ? fill(messages.queued) : `Seu atendimento já está na fila ${r.poloName ? `do polo ${poloLabel(r.poloName)}` : "da nossa equipe"}. Assim que um consultor estiver disponível, ele continua com você por aqui.`;
    return [base, queued].filter(Boolean).join(" ");
  }
  return base;
};

// "Porto Velho - Centro - RO" is said "Porto Velho"
const poloLabel = (name: string): string => String(name || "").replace(/\s*[-(].*$/, "").trim() || name;


// ---------------------------------------------------------------- what would happen (the tester): the same choices, nothing written
export interface RoutePreview {
  team: string;
  polo: string | null;
  poloReason: string;
  queue: string | null;
  queueReason: string;
  consultant: string | null;
  consultantReason: string;
  within: boolean;
  whenText: string | null;
  priority: string | null;
  // what the lead would read after the handoff
  notice: string | null;
}

export const previewRoute = async (opts: { city?: string | null; team?: Team; keepOwner?: boolean; hot?: boolean; ownerId?: number | null; preferredUserId?: number | null; preferredName?: string | null; messages?: { queued?: string; afterHours?: string } | null }): Promise<RoutePreview> => {
  const team: Team = opts.team || "comercial";
  const { polo, ambiguous } = opts.city ? await resolvePolo(opts.city) : { polo: null as Polo | null, ambiguous: false };
  const { queue, fallback } = await pickQueue(polo ? polo.id : null, team);
  const users: User[] = queue ? (queue as any).users || [] : [];
  let consultant: User | null = null;
  let consultantReason = "Nenhuma fila para receber a conversa: a gestão é avisada.";
  if (queue) {
    const owner = opts.ownerId && opts.keepOwner !== false ? users.find(u => u.id === opts.ownerId) : null;
    const wanted = opts.preferredUserId ? users.find(u => u.id === opts.preferredUserId) : null;
    if (wanted) { consultant = wanted; consultantReason = "Consultor pedido pelo lead, e ele faz parte da equipe que recebe a conversa."; }
    else if (owner) { consultant = owner; consultantReason = "Continuidade: o lead já é atendido por este consultor, que faz parte da equipe."; }
    else if (users.length) {
      consultant = await pickUserForQueue(queue, true, true);
      const askedNote = opts.preferredName ? ` O lead pediu ${opts.preferredName}, mas essa pessoa não faz parte da equipe que recebe (fora do escopo permitido).` : "";
      const mode = !queue.autoAssign || queue.autoAssign === "none" ? "least" : queue.autoAssign;
      consultantReason = consultant ? (mode === "round_robin" || mode === "roundrobin" ? "Revezamento da fila, entre quem tem WhatsApp conectado." : "Quem tem menos conversas abertas na fila, entre quem tem WhatsApp conectado.") + askedNote : "Ninguém disponível: a conversa fica na fila.";
    } else consultantReason = "A fila não tem consultores: a conversa fica aguardando.";
  }
  const business = await getBusinessConfig();
  const within = isBusinessNow(business);
  const when = within ? null : whenText(nextOpening(business));
  const routed: Routed = {
    queueId: queue ? queue.id : null, queueName: queue ? queue.name : null, userId: consultant ? consultant.id : null, userName: consultant ? consultant.name : null,
    poloId: polo ? polo.id : null, poloName: polo ? polo.name : null, fallback, within, whenText: when, semipresencial: null
  };
  return {
    team: TEAM_LABEL[team],
    polo: polo ? polo.name : null,
    poloReason: polo ? `Cidade informada: ${opts.city}.` : opts.city ? (ambiguous ? `A cidade “${opts.city}” combina com mais de um polo: o agente pergunta qual.` : `Nenhum polo atende “${opts.city}”: fila de reserva.`) : "Cidade ainda não informada: fila de reserva.",
    queue: queue ? queue.name : null,
    queueReason: queue ? (fallback ? "Fila de reserva (o polo não tem equipe comercial própria ou não foi identificado)." : `Equipe ${TEAM_LABEL[team].toLowerCase()} do polo.`) : "Nenhuma fila configurada.",
    consultant: consultant ? consultant.name : null,
    consultantReason,
    within,
    whenText: when,
    priority: opts.hot && (!consultant || !within) ? "alta" : null,
    notice: afterHandoffNotice(routed, opts.messages || null)
  };
};
