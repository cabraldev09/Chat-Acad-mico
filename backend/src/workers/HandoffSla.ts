import { Op } from "sequelize";

import { getSetting } from "../helpers/AppSettings";
import { businessMinutes, getBusinessConfig, isBusinessNow } from "../helpers/BusinessTime";
import { getIO } from "../libs/socket";
import Lead from "../models/Lead";
import Message from "../models/Message";
import Queue from "../models/Queue";
import Ticket from "../models/Ticket";
import TicketEvent from "../models/TicketEvent";
import User from "../models/User";
import { pickUserForQueue } from "../services/AutomationServices/AutoAssignTicket";
import { addActivity } from "../services/CrmServices/LeadCore";
import UpdateTicketService from "../services/TicketServices/UpdateTicketService";
import { logger } from "../utils/logger";

const MARK = "‎";

// A conversation the AI agent handed to the commercial team must be answered by a person. Counted only inside the working hours:
//   1st time the limit passes (default 15 min): live notice to the consultant, the queue and the managers;
//   2nd time (another limit later): the conversation goes to the next consultant of the queue and everybody is warned again.
// A person's reply ends the watch.
const tick = async (): Promise<void> => {
  try {
    const limit = Number(await getSetting("crm_handoff_sla_minutes", "15"));
    if (!limit) return;
    const business = await getBusinessConfig();
    if (!isBusinessNow(business)) return;

    const now = new Date();
    const tickets = await Ticket.findAll({
      where: { handoffAt: { [Op.ne]: null, [Op.gte]: new Date(now.getTime() - 72 * 3600000) } as any, status: { [Op.ne]: "closed" }, handoffAlerts: { [Op.lt]: 2 } },
      limit: 100
    });
    for (const ticket of tickets) {
      // eslint-disable-next-line no-await-in-loop
      const answered = await Message.count({ where: { ticketId: ticket.id, fromMe: true, createdAt: { [Op.gt]: ticket.handoffAt }, body: { [Op.notLike]: `${MARK}%` } } as any });
      if (answered) {
        // eslint-disable-next-line no-await-in-loop
        await Ticket.update({ handoffAt: null as any }, { where: { id: ticket.id } });
        continue;
      }
      const since = ticket.handoffAlertedAt || ticket.handoffAt;
      if (businessMinutes(business, new Date(since), now) < limit) continue;

      // eslint-disable-next-line no-await-in-loop
      const lead = await Lead.findOne({ where: { contactId: ticket.contactId }, attributes: ["id", "name"] });
      const name = lead?.name || "";
      let userId = ticket.userId || null;
      let note = `Aguardando atendimento humano há ${Math.round(businessMinutes(business, new Date(ticket.handoffAt), now))} min`;
      if (ticket.handoffAlerts >= 1 && ticket.queueId) {
        // second time: the next consultant of the queue
        // eslint-disable-next-line no-await-in-loop
        const queue = await Queue.findByPk(ticket.queueId, { include: [{ model: User, as: "users", attributes: ["id", "name"] }] });
        const others = ((queue as any)?.users || []).filter((u: User) => u.id !== ticket.userId);
        if (queue && others.length) {
          // eslint-disable-next-line no-await-in-loop
          const next = await pickUserForQueue({ id: queue.id, autoAssign: "roundrobin", users: others } as any, true);
          if (next) {
            // eslint-disable-next-line no-await-in-loop
            await UpdateTicketService({ ticketData: { userId: next.id, status: "open" }, ticketId: ticket.id });
            // eslint-disable-next-line no-await-in-loop
            await TicketEvent.create({ ticketId: ticket.id, type: "transfer", actorId: null, toQueueId: queue.id, toUserId: next.id, note: "Sem resposta do consultor: a conversa passou para o próximo da fila." } as any);
            userId = next.id;
            note = `${note}; passou para ${next.name}`;
          }
        }
      }
      // eslint-disable-next-line no-await-in-loop
      await Ticket.update({ handoffAlerts: ticket.handoffAlerts + 1, handoffAlertedAt: now }, { where: { id: ticket.id } });
      if (lead) {
        // eslint-disable-next-line no-await-in-loop
        await addActivity(lead.id, null, "sla", `${note}.`).catch(() => undefined);
      }
      getIO().emit("handoffAlert", { ticketId: ticket.id, leadId: lead ? lead.id : null, name, userId, queueId: ticket.queueId || null, level: ticket.handoffAlerts + 1, note });
    }
  } catch (err) {
    logger.warn(`Handoff SLA tick failed: ${err}`);
  }
};

export const startHandoffSla = (): void => {
  setInterval(tick, Number(process.env.HANDOFF_SLA_MS) || 60000);
};

export { tick as runHandoffSlaOnce };
