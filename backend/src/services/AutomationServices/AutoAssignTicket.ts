import { Op } from "sequelize";

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
export const pickUserForQueue = async (queue: Queue, force = false): Promise<User | null> => {
  const mode = !queue.autoAssign || queue.autoAssign === "none" ? (force ? "least" : "none") : queue.autoAssign;
  if (mode === "none") return null;

  const all = [...(queue.users || [])].sort((a, b) => a.id - b.id);
  if (!all.length) return null;
  // somebody who never connected a WhatsApp cannot answer: when at least one colleague of the queue can, the lead goes to them
  const connected = new Set(
    (await Whatsapp.findAll({ where: { ownerId: all.map(u => u.id), channel: "whatsapp", status: "CONNECTED" } as any, attributes: ["ownerId"] })).map(w => Number(w.ownerId))
  );
  const reachable = all.filter(u => connected.has(u.id));
  const users = reachable.length ? reachable : all;

  if (mode === "least") {
    const counts = await Promise.all(
      users.map(u => Ticket.count({ where: { userId: u.id, status: { [Op.not]: "closed" } } }))
    );
    return users[counts.indexOf(Math.min(...counts))];
  }
  const key = `autoAssign_last_${queue.id}`;
  const last = Number(await getSetting(key, "0"));
  const chosen = users.find(u => u.id > last) || users[0];
  await setSetting(key, String(chosen.id));
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

export default AutoAssignTicket;
