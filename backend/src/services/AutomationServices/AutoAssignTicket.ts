import { Transaction } from "sequelize";
import { transactionContext } from "../../helpers/TransactionContext";
import sequelize from "../../database";
import { eligibleForAssignment } from "./AssignmentPolicy";
import { Op } from "sequelize";

import Lead from "../../models/Lead";
import Queue from "../../models/Queue";
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

  const members = await User.findAll({ where: { id: (queue.users || []).map(u => u.id) }, attributes: ["id", "name", "acceptsNewTickets", "maxOpenTickets"], order: [["id", "ASC"]] });
  const loads = await Promise.all(members.map(u => Ticket.count({ where: { userId: u.id, status: { [Op.ne]: "closed" } } })));
  const users = members.filter((u, i) => eligibleForAssignment(u, loads[i]));
  if (!users.length) return null;

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

const assign = async (ticket: Ticket): Promise<boolean> => {
  await ticket.reload();
  if (!ticket.queueId || ticket.userId || ticket.isGroup) return false;

  const queue = await Queue.findByPk(ticket.queueId, {
    include: [{ model: User, as: "users", attributes: ["id", "name", "acceptsNewTickets", "maxOpenTickets"] }]
  });
  if (!queue) return false;
  const chosen = await pickUserForQueue(queue);
  if (!chosen) return false;

  try {
    await UpdateTicketService({
      ticketData: { userId: chosen.id, status: "open" },
      ticketId: ticket.id
    });
    if ((ticket.segment || "sales") === "sales") await Lead.update({ ownerId: chosen.id }, { where: { contactId: ticket.contactId, wonAt: null as any, lostAt: null as any } });
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

const AutoAssignTicket = async (ticket: Ticket): Promise<boolean> => {
  const run = async (transaction: Transaction) => {
  // A short transaction: the capacity calculation and assignment must be one decision.
  if (sequelize.getDialect() === "postgres") await sequelize.query("SELECT pg_advisory_xact_lock(918271)", { transaction });
  return assign(ticket);
  };
  const current = transactionContext.get("transaction") as Transaction | undefined;
  return current ? run(current) : sequelize.transaction(run);
};

export default AutoAssignTicket;
