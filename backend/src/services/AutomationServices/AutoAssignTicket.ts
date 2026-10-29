import { onScheduleNow } from "../AnalyticsServices/AnalyticsService";
import { Op, QueryTypes } from "sequelize";
import sequelize from "../../database";
import { portable } from "../../helpers/sqlDialect";

import Queue from "../../models/Queue";
import Whatsapp from "../../models/Whatsapp";
import Ticket from "../../models/Ticket";
import User from "../../models/User";
import { getSetting, setSetting } from "../../helpers/AppSettings";
import UpdateTicketService from "../TicketServices/UpdateTicketService";
import { logger } from "../../utils/logger";
import TicketEvent from "../../models/TicketEvent";

// Queue.autoAssign: "none" | "roundrobin" | "least" (fewest open tickets)
// Picks the next agent of a queue; `force` ignores "none" (used when someone must be chosen anyway)
// dryRun: only says who would be chosen (the rotation does not move), for the tester of the agent
export const pickUserForQueue = async (queue: Queue, force = false, dryRun = false): Promise<User | null> => {
  const mode = !queue.autoAssign || queue.autoAssign === "none" ? (force ? "least" : "none") : queue.autoAssign;
  if (mode === "none") return null;

  const all = [...(queue.users || [])].sort((a, b) => a.id - b.id);
  if (!all.length) return null;
  // somebody who never connected a WhatsApp cannot answer: when at least one colleague of the queue can, the lead goes to them
  // the order of preference: a number connected now, then someone who owns a number (it may be reconnecting after a restart), and only then everybody
  const numbers = await Whatsapp.findAll({ where: { ownerId: all.map(u => u.id), channel: "whatsapp" } as any, attributes: ["ownerId", "status"] });
  const connected = new Set(numbers.filter(w => w.status === "CONNECTED").map(w => Number(w.ownerId)));
  const owners = new Set(numbers.map(w => Number(w.ownerId)));
  const reachable = all.filter(u => connected.has(u.id));
  const withNumber = all.filter(u => owners.has(u.id));
  const pool = reachable.length ? reachable : withNumber.length ? withNumber : all;
  // inside the working hours the manager set: those on duty now come first (when nobody is, or nobody has a schedule, the pool stays as it is)
  const duty = await onScheduleNow(pool.map(u => u.id)).catch(() => null);
  const onDuty = duty ? pool.filter(u => duty.has(u.id)) : [];
  const users = onDuty.length ? onDuty : pool;

  if (mode === "least") {
    const counts = await Promise.all(
      users.map(u => Ticket.count({ where: { userId: u.id, status: { [Op.not]: "closed" } } }))
    );
    return users[counts.indexOf(Math.min(...counts))];
  }
  const key = `autoAssign_last_${queue.id}`;
  const last = Number(await getSetting(key, "0"));
  const chosen = users.find(u => u.id > last) || users[0];
  if (!dryRun) await setSetting(key, String(chosen.id));
  return chosen;
};

const AutoAssignTicket = async (ticket: Ticket): Promise<boolean> => {
  if (!ticket.queueId || ticket.userId || ticket.isGroup) return false;

  const queue = await Queue.findByPk(ticket.queueId, {
    include: [{ model: User, as: "users", attributes: ["id", "name"] }]
  });
  if (!queue) return false;
  const chosen = await pickUserForQueue(queue);
  if (!chosen) return false;

  try {
    await UpdateTicketService({
      ticketData: { userId: chosen.id, status: "open" },
      ticketId: ticket.id
    });
    await TicketEvent.create({
      ticketId: ticket.id,
      type: "auto_assigned",
      toQueueId: queue.id,
      toUserId: chosen.id
    });
    return true;
  } catch (err) {
    logger.error(`Auto-assign failed: ${err}`);
    return false;
  }
};

// Conversations sitting with someone who never connected a WhatsApp (they cannot receive or answer) go to a colleague of the same queue who can.
// Whoever has no number of their own cannot hold a conversation, even one they touched recently: it goes to a colleague who can answer. Their open tasks follow (UpdateTicketService realigns them).
export const redistributeUnreachableTickets = async (): Promise<number> => {
  const stuck = (await sequelize.query(
    portable(`
    SELECT t.id FROM Tickets t
    JOIN Users u ON u.id = t.userId AND u.profile <> 'admin' AND (u.role = 'consultor' OR u.role IS NULL OR u.role = '')
    WHERE t.status IN ('open', 'pending') AND t.isGroup = false AND t.isHistorical = false AND t.queueId IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM Whatsapps w WHERE w.channel = 'whatsapp' AND w.ownerId = t.userId)
    ORDER BY t.id LIMIT 50`),
    { type: QueryTypes.SELECT }
  )) as any[];
  let moved = 0;
  for (const row of stuck) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const ticket = await Ticket.findByPk(row.id);
      if (!ticket || !ticket.queueId) continue;
      // eslint-disable-next-line no-await-in-loop
      const queue = await Queue.findByPk(ticket.queueId, { include: [{ model: User, as: "users", attributes: ["id", "name"] }] });
      if (!queue) continue;
      const others = ((queue as any).users || []).filter((u: User) => u.id !== ticket.userId);
      // eslint-disable-next-line no-await-in-loop
      const chosen = others.length ? await pickUserForQueue({ id: queue.id, autoAssign: "roundrobin", users: others } as any, true) : null;
      if (!chosen) continue;
      const hasNumber = (await Whatsapp.count({ where: { ownerId: chosen.id, channel: "whatsapp" } as any })) > 0; // eslint-disable-line no-await-in-loop
      if (!hasNumber) continue;
      const from = ticket.userId;
      // eslint-disable-next-line no-await-in-loop
      await UpdateTicketService({ ticketData: { userId: chosen.id, status: ticket.status === "pending" ? "pending" : "open" }, ticketId: ticket.id });
      // eslint-disable-next-line no-await-in-loop
      await TicketEvent.create({ ticketId: ticket.id, type: "transfer", actorId: null, fromUserId: from, toUserId: chosen.id, note: "A conversa estava com quem ainda não conectou o WhatsApp e passou para um colega que atende." } as any);
      moved += 1;
    } catch (err) {
      logger.warn(`redistribute ticket ${row.id} failed: ${err}`);
    }
  }
  return moved;
};

export default AutoAssignTicket;
