import { Transaction } from "sequelize";

import { afterCommit } from "../../helpers/TransactionContext";
import { leadClaimed } from "./QueueNotices";
import { isQueueLead, isQueueMode, queueLeadWhere } from "../../helpers/LeadQueue";
import { roleOf } from "../../helpers/Roles";
import Lead from "../../models/Lead";
import User from "../../models/User";
import LeadActivity from "../../models/LeadActivity";

// Whoever takes the conversation of a person that is still in the common queue takes the lead with it, in the SAME transaction (so a
// conversation and its lead can never end with two different people). Called by ClaimTicketService before it locks the conversation: the lock
// order is always the lead, then the conversations. Does nothing when the queue is off, the contact has no lead, the lead is not in the queue
// (someone owns it already, a student, lost...) or the person does not work leads (tutors and the relationship team).
// The conversation itself decides the conflict: if somebody else took the lead first, the claim of the conversation answers 409.
const OWNER_ROLES = ["admin", "coordenacao", "consultor"];

const claimLeadOfTicket = async (contactId: number, userId: number, transaction: Transaction): Promise<boolean> => {
  if (!(await isQueueMode())) return false;
  const lead = await Lead.findOne({ where: { contactId }, transaction, lock: transaction.LOCK.UPDATE });
  if (!lead || !isQueueLead(lead)) return false;
  const user = await User.findByPk(userId, { attributes: ["id", "role", "profile"], transaction });
  if (!user || !OWNER_ROLES.includes(roleOf(user as any))) return false;
  const [affected] = await Lead.update({ ownerId: userId } as any, { where: { id: lead.id, ...queueLeadWhere() }, transaction });
  if (!affected) return false;
  await LeadActivity.create({ leadId: lead.id, userId, type: "assumed", body: "Lead assumido da fila comum.", meta: null } as any, { transaction });
afterCommit(() => leadClaimed(lead.id, userId));
  return true;
};

export default claimLeadOfTicket;
