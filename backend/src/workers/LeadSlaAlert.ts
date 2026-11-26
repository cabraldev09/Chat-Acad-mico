import { Op } from "sequelize";
import Lead from "../models/Lead";
import Contact from "../models/Contact";
import Ticket from "../models/Ticket";
import Message from "../models/Message";
import TicketEvent from "../models/TicketEvent";
import { getIO } from "../libs/socket";
import { getSetting } from "../helpers/AppSettings";
import { getBusinessConfig, isBusinessNow, businessMinutes } from "../helpers/BusinessTime";
import { addActivity } from "../services/CrmServices/LeadCore";
import AutoAssignTicket from "../services/AutomationServices/AutoAssignTicket";
import { notify, managerIdsOfPolos } from "../services/NotificationServices/Notify";
import { isQueueLead, isQueueMode } from "../helpers/LeadQueue";
import { consultantIds, queueNoticeKey } from "../services/CrmServices/QueueNotices";
import { logger } from "../utils/logger";
import { slaDecision, howLong, forgottenNotice } from "../services/NotificationServices/SlaRules";

let running = false;
let cursor = 0;
// the waits too old to alert one by one, per person, gathered over one full pass of the list and told once a day
let forgotten = new Map<number, Set<number>>();
const tellForgotten = async (): Promise<void> => {
  const day = new Date().toISOString().slice(0, 10);
  const pending = forgotten;
  forgotten = new Map();
  for (const [userId, tickets] of pending) {
    // eslint-disable-next-line no-await-in-loop
    await notify([userId], { kind: "sla_forgotten", level: "info", ...forgottenNotice(tickets.size), link: "/tickets", dedupeKey: `sla-old:${userId}:${day}` });
  }
};
// Every unanswered exchange is monitored, including after the first human reply.
const tick = async (): Promise<void> => {
  if (running) return;
  running = true;
  try {
    const minutes = Number(await getSetting("crm_sla_minutes", "15"));
    if (!(minutes > 0)) return;
    const escalate = Math.max(minutes, Number(await getSetting("crm_escalation_minutes", "30")) || 30);
    const business = await getBusinessConfig();
    if (!isBusinessNow(business)) return;
    const now = new Date();
    // only what can need something: the customer spoke last (an answer is owed), or nobody has the conversation yet (to distribute it).
    // Before, every open conversation was read (four queries each) every minute.
    const tickets = await Ticket.findAll({
      where: {
        id: { [Op.gt]: cursor }, status: { [Op.in]: ["pending", "open"] }, isHistorical: false, isGroup: false, archivedAt: null as any,
        [Op.or]: [{ lastMessageFromMe: { [Op.not]: true } }, { userId: null, aiActive: { [Op.not]: true } }]
      } as any,
      include: [{ model: Contact, as: "contact", where: { isStaff: false, noReply: false, kind: "person" } }],
      order: [["id", "ASC"]], limit: 200
    });
    cursor = tickets.length === 200 ? tickets[tickets.length - 1].id : 0;
    const maxAgeHours = Number(await getSetting("crm_sla_max_age_hours", "24"));
    const queueMode = await isQueueMode();
    const leads = new Map((await Lead.findAll({ where: { contactId: [...new Set(tickets.map(t => t.contactId))] } as any, attributes: ["id", "name", "contactId", "ownerId", "poloId", "enrolledAt", "wonAt", "lostAt", "isHistorical", "onboardingStatus"] })).map(l => [l.contactId, l]));
    for (const ticket of tickets) {
      const lead = leads.get(ticket.contactId);
      if (!lead || ticket.contact?.optOut) continue;
      if (!ticket.userId && !ticket.aiActive) await AutoAssignTicket(ticket);
      const last = await Message.findOne({ where: { ticketId: ticket.id, isDeleted: false }, order: [["createdAt", "DESC"], ["id", "DESC"]] });
      if (!last || last.fromMe) continue;
      const reply = await Message.findOne({ where: { ticketId: ticket.id, fromMe: true, isDeleted: false }, order: [["createdAt", "DESC"]] });
      const first = await Message.findOne({
        where: { ticketId: ticket.id, fromMe: false, isDeleted: false, ...(reply ? { createdAt: { [Op.gt]: reply.createdAt } } : {}) },
        order: [["createdAt", "ASC"], ["id", "ASC"]]
      });
      if (!first) continue;
      // "obrigado", "ok", a sticker: nothing to answer. A wait that started days ago (copied from the phone): one line a day, not an alert
      const decision = slaDecision(last, first, now, maxAgeHours);
      if (decision === "closing") continue;
      if (decision === "old") {
        const owner = ticket.userId || lead.ownerId;
        if (owner) { if (!forgotten.has(owner)) forgotten.set(owner, new Set()); forgotten.get(owner)!.add(ticket.id); }
        continue;
      }
      const waited = businessMinutes(business, new Date(first.createdAt), now);
      const escalated = waited >= escalate;
      // THE COMMON QUEUE: a new lead nobody has taken yet. The consultants hear it ONCE each (the notice goes away when somebody assumes the lead);
      // nobody is "late" for it until the management's deadline, which is the escalation below.
      const inQueue = queueMode && !ticket.userId && isQueueLead(lead);
      if (inQueue && !escalated) {
        if (waited >= minutes * 0.7) {
          await notify(await consultantIds(), { kind: "queue_lead", level: "warning", title: `Lead novo na fila há ${Math.round(waited)} min: ${lead.name}`, body: "Quem assumir primeiro atende.", link: `/tickets/${ticket.id}`, dedupeKey: queueNoticeKey(lead.id) });
        }
        continue;
      }
      // about to break (70% of the time): the person who answers hears it in the bell, once per message waiting
      if (waited < minutes) {
        const owner = ticket.userId || lead.ownerId;
        if (owner && waited >= minutes * 0.7) {
          await notify([owner], { kind: "sla_soon", level: "warning", title: `${lead.name} espera resposta há ${howLong(waited)}`, body: `O prazo de resposta é ${howLong(minutes)}.`, link: `/tickets/${ticket.id}`, dedupeKey: `sla-soon:${ticket.id}:${first.id}` });
        }
        continue;
      }
      const field = escalated ? "slaEscalatedMessageId" : "slaAlertedMessageId";
      const [claimed] = await Ticket.update({ [field]: first.id }, { where: { id: ticket.id, [Op.or]: [{ [field]: { [Op.ne]: first.id } }, { [field]: { [Op.is]: null } }] } as any });
      if (!claimed) continue;
      const note = `${escalated ? "Prazo escalado para a gestão" : "Prazo de resposta excedido"}: ${howLong(waited)} aguardando resposta.${!ticket.userId && !ticket.aiActive ? (inQueue ? " Na fila comum: nenhum consultor assumiu." : " Sem atendente disponível: distribuir manualmente.") : ""}`;
      await TicketEvent.create({ ticketId: ticket.id, type: "sla", note });
      await addActivity(lead.id, null, "sla", note);
      getIO().emit("leadAlert", { leadId: lead.id, ticketId: ticket.id, name: lead.name, ownerId: ticket.userId || lead.ownerId, minutes: Math.round(waited), escalated });
      // kept in the bell: the person who answers; when escalated, the management too
      const who = [ticket.userId || lead.ownerId, ...(escalated ? await managerIdsOfPolos([lead.poloId]) : [])];
      await notify(who, { kind: escalated ? "sla_escalated" : "sla_breached", level: escalated ? "urgent" : "warning", title: `${escalated ? "Prazo escalado" : "Prazo de resposta excedido"}: ${lead.name}`, body: `Espera resposta há ${howLong(waited)}.`, link: `/tickets/${ticket.id}`, dedupeKey: `sla:${ticket.id}:${first.id}:${escalated ? "esc" : "alert"}` });

    }
    if (!cursor) await tellForgotten();
  } catch (err) { logger.warn(`Lead SLA alert: ${err}`); }
  finally { running = false; }
};
export const startLeadSlaAlert = (): void => { setInterval(tick, 60000); };
export { tick as runLeadSlaAlertOnce };
