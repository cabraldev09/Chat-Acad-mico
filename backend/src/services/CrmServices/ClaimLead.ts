import { Op, Transaction } from "sequelize";

import sequelize from "../../database";
import AppError from "../../errors/AppError";
import { afterCommit } from "../../helpers/TransactionContext";
import { leadClaimed } from "./QueueNotices";
import { firstNameOf, isQueueLead, queueLeadWhere } from "../../helpers/LeadQueue";
import Lead from "../../models/Lead";
import Ticket from "../../models/Ticket";
import User from "../../models/User";
import ClaimTicketService from "../TicketServices/ClaimTicketService";
import { addActivity } from "./LeadCore";
import { logger } from "../../utils/logger";

// "Assumir": the first person to take a lead of the common queue becomes its owner (the "carteira"); nobody else can.
// One decision, in one transaction, always in the same lock order (the lead, then its conversations by id):
//   1. the lead changes hands with a conditional write (UPDATE ... WHERE ownerId IS NULL AND <queue>): of two at the same time one gets a row,
//      the other none, and then NOTHING else changes (409 ERR_LEAD_ALREADY_ASSIGNED, with the first name of the new owner);
//   2. the conversations of that person nobody attends yet become the winner's (ClaimTicketService, the same single place that assigns one);
//      the ones that already have a human attendant stay with them;
//   3. one record in the lead's history.
// After the commit: the screens of the other consultants drop the card (socket "lead" action "claimed", carrying only ids).
export interface ClaimLeadResult {
  lead: Lead;
  // false when the lead was already the person's own (nothing changed)
  changed: boolean;
  ticketIds: number[];
}

const claimWork = async (leadId: number, userId: number, transaction: Transaction): Promise<ClaimLeadResult> => {
  // the lock comes first and also makes the second caller wait for the first one's commit
  const row = await Lead.findByPk(leadId, { transaction, lock: transaction.LOCK.UPDATE });
  if (!row) throw new AppError("ERR_LEAD_NOT_FOUND", 404);
  if (row.ownerId === userId) return { lead: row, changed: false, ticketIds: [] };
  if (row.ownerId) {
    const owner = await User.findByPk(row.ownerId, { attributes: ["id", "name"], transaction });
    throw new AppError("ERR_LEAD_ALREADY_ASSIGNED", 409, { leadId, ownerName: firstNameOf(owner?.name) });
  }
  // an enrolled student, a lost lead, a student of the tutoring and the phone's history are never taken from the queue
  if (!isQueueLead(row)) throw new AppError("ERR_LEAD_NOT_CLAIMABLE", 409, { leadId });

  const [affected] = await Lead.update({ ownerId: userId } as any, { where: { id: leadId, ...queueLeadWhere() }, transaction });
  if (!affected) throw new AppError("ERR_LEAD_ALREADY_ASSIGNED", 409, { leadId });

  const tickets = row.contactId
    ? await Ticket.findAll({
        where: { contactId: row.contactId, userId: { [Op.is]: null }, isGroup: false, isHistorical: false, status: { [Op.ne]: "closed" }, segment: { [Op.or]: [{ [Op.is]: null }, "sales"] } } as any,
        attributes: ["id"],
        order: [["id", "ASC"]],
        transaction,
        lock: transaction.LOCK.UPDATE
      })
    : [];
  const ticketIds: number[] = [];
  for (const t of tickets) {
    // eslint-disable-next-line no-await-in-loop
    await ClaimTicketService({ ticketId: t.id, userId, reason: "accept", transaction });
    ticketIds.push(t.id);
  }

  await addActivity(leadId, userId, "assumed", "Lead assumido da fila comum.");
  const lead = (await Lead.findByPk(leadId, { transaction })) as Lead;
afterCommit(() => leadClaimed(leadId, userId));
  return { lead, changed: true, ticketIds };
};

const claimLead = async (leadId: number, userId: number, parent?: Transaction): Promise<ClaimLeadResult> => {
  try {
    return parent ? await claimWork(leadId, userId, parent) : await sequelize.transaction(t => claimWork(leadId, userId, t));
  } catch (err) {
    if (!(err instanceof AppError)) logger.warn(`Claim of lead ${leadId} failed: ${err}`);
    throw err;
  }
};

export default claimLead;
