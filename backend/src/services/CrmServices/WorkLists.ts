import { Op } from "sequelize";
import Lead from "../../models/Lead";
import Proposal from "../../models/Proposal";
import Payment from "../../models/Payment";

export const workLists = async (userId: number) => {
  const leads = await Lead.findAll({ where: { ownerId: userId, wonAt: null as any, lostAt: null as any }, attributes: ["id", "name", "nextFollowUpAt"] });
  const ids = leads.map(l => l.id);
  const [proposals, payments] = await Promise.all([
    Proposal.findAll({ where: { leadId: ids, status: "sent" }, order: [["sentAt", "ASC"]], limit: 20 }),
    Payment.findAll({ where: { leadId: ids, status: { [Op.in]: ["pending", "scheduled"] } }, order: [["createdAt", "ASC"]], limit: 20 })
  ]);
  return {
    proposals: proposals.map(p => ({ id: p.id, leadId: p.leadId, name: leads.find(l => l.id === p.leadId)?.name, course: p.courseName, viewed: !!p.viewedAt })),
    payments: payments.map(p => ({ id: p.id, leadId: p.leadId, name: leads.find(l => l.id === p.leadId)?.name, amount: p.amount, status: p.status }))
  };
};
