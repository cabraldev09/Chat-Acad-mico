import { Op } from "sequelize";

import Queue from "../../models/Queue";
import Ticket from "../../models/Ticket";
import User from "../../models/User";
import { getSetting, setSetting } from "../../helpers/AppSettings";
import UpdateTicketService from "../TicketServices/UpdateTicketService";
import { logger } from "../../utils/logger";
import TicketEvent from "../../models/TicketEvent";

// Queue.autoAssign: "none" | "roundrobin" | "least" (fewest open tickets)
const AutoAssignTicket = async (ticket: Ticket): Promise<boolean> => {
  if (!ticket.queueId || ticket.userId || ticket.isGroup) return false;

  const queue = await Queue.findByPk(ticket.queueId, {
    include: [{ model: User, as: "users", attributes: ["id", "name"] }]
  });
  if (!queue || !queue.autoAssign || queue.autoAssign === "none") return false;

  const users = [...(queue.users || [])].sort((a, b) => a.id - b.id);
  if (!users.length) return false;

  let chosen: User;
  if (queue.autoAssign === "least") {
    const counts = await Promise.all(
      users.map(u =>
        Ticket.count({ where: { userId: u.id, status: { [Op.not]: "closed" } } })
      )
    );
    const min = Math.min(...counts);
    chosen = users[counts.indexOf(min)];
  } else {
    const key = `autoAssign_last_${queue.id}`;
    const last = Number(await getSetting(key, "0"));
    chosen = users.find(u => u.id > last) || users[0];
    await setSetting(key, String(chosen.id));
  }

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
