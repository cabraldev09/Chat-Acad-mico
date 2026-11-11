import sequelize from "../../database";
import Lead from "../../models/Lead";
import LeadTask from "../../models/LeadTask";
import { getIO } from "../../libs/socket";
import { Transaction } from "sequelize";
import { transactionContext } from "../../helpers/TransactionContext";

export const syncLeadFollowUp = async (leadId: number, inherited?: Transaction): Promise<void> => {
  const sync = async (transaction: Transaction) => {
    const lead = await Lead.findByPk(leadId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!lead) return;
    const next = await LeadTask.findOne({ where: { leadId, doneAt: null as any }, order: [["dueAt", "ASC"]], transaction });
    await lead.update({ nextFollowUpAt: next?.dueAt || null }, { transaction });
    let root = transaction;
    while ((root as any).parent) root = (root as any).parent;
    root.afterCommit(() => { getIO().emit("lead", { action: "update", lead }); });
  };
  const current = inherited || transactionContext.get("transaction") as Transaction | undefined;
  if (current) await sync(current);
  else await sequelize.transaction(sync);
};

export const ensureTask = async (a: { key: string; leadId: number; userId: number; title: string; dueAt: Date; type?: string }): Promise<LeadTask> => {
  const [task] = await LeadTask.findOrCreate({
    where: { automationKey: a.key },
    defaults: { automationKey: a.key, leadId: a.leadId, userId: a.userId, title: a.title, dueAt: a.dueAt, type: a.type || "outro" }
  });
  return task;
};
