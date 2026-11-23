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
import { notify, managerIds } from "../services/NotificationServices/Notify";
import { logger } from "../utils/logger";

let running = false;
let cursor = 0;
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
    const leads = new Map((await Lead.findAll({ where: { contactId: [...new Set(tickets.map(t => t.contactId))] } as any, attributes: ["id", "name", "contactId", "ownerId"] })).map(l => [l.contactId, l]));
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
      const waited = businessMinutes(business, new Date(first.createdAt), now);
      const escalated = waited >= escalate;
      // about to break (70% of the time): the person who answers hears it in the bell, once per message waiting
      if (waited < minutes) {
        const owner = ticket.userId || lead.ownerId;
        if (owner && waited >= minutes * 0.7) {
          await notify([owner], { kind: "sla_soon", level: "warning", title: `${lead.name} espera resposta há ${Math.round(waited)} min`, body: `O prazo de resposta é ${minutes} min.`, link: `/tickets/${ticket.id}`, dedupeKey: `sla-soon:${ticket.id}:${first.id}` });
        }
        continue;
      }
      const field = escalated ? "slaEscalatedMessageId" : "slaAlertedMessageId";
      const [claimed] = await Ticket.update({ [field]: first.id }, { where: { id: ticket.id, [Op.or]: [{ [field]: { [Op.ne]: first.id } }, { [field]: { [Op.is]: null } }] } as any });
      if (!claimed) continue;
      const note = `${escalated ? "Prazo escalado para a gestão" : "Prazo de resposta excedido"}: ${Math.round(waited)} min aguardando resposta.${!ticket.userId && !ticket.aiActive ? " Sem atendente disponível: distribuir manualmente." : ""}`;
      await TicketEvent.create({ ticketId: ticket.id, type: "sla", note });
      await addActivity(lead.id, null, "sla", note);
      getIO().emit("leadAlert", { leadId: lead.id, ticketId: ticket.id, name: lead.name, ownerId: ticket.userId || lead.ownerId, minutes: Math.round(waited), escalated });
      // kept in the bell: the person who answers; when escalated, the management too
      const who = [ticket.userId || lead.ownerId, ...(escalated ? await managerIds() : [])];
      await notify(who, { kind: escalated ? "sla_escalated" : "sla_breached", level: escalated ? "urgent" : "warning", title: `${escalated ? "Prazo escalado" : "Prazo de resposta excedido"}: ${lead.name}`, body: `${Math.round(waited)} min aguardando resposta.`, link: `/tickets/${ticket.id}`, dedupeKey: `sla:${ticket.id}:${first.id}:${escalated ? "esc" : "alert"}` });

    }
  } catch (err) { logger.warn(`Lead SLA alert: ${err}`); }
  finally { running = false; }
};
export const startLeadSlaAlert = (): void => { setInterval(tick, 60000); };
export { tick as runLeadSlaAlertOnce };
