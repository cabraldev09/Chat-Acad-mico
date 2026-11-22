import { Op } from "sequelize";

import LeadTask from "../models/LeadTask";
import Lead from "../models/Lead";
import { getIO } from "../libs/socket";
import { logger } from "../utils/logger";

// Pushes a socket notification for every follow-up task that just became due
const tick = async (): Promise<void> => {
  try {
    const due = await LeadTask.findAll({
      where: { doneAt: null as any, notifiedAt: null as any, dueAt: { [Op.lte]: new Date() } },
      include: [{ model: Lead, as: "lead", attributes: ["id", "name"] }],
      limit: 50
    });
    if (!due.length) return;
    // one update for the whole batch, without the per-task hook (marking "reminded" does not change the next follow-up of the lead, and
    // the hook re-saved and re-broadcast the lead once per task); only the rows still unmarked are taken, so two instances never repeat one
    const [, marked] = await LeadTask.update({ notifiedAt: new Date() } as any, { where: { id: due.map(t => t.id), notifiedAt: null as any }, returning: true } as any) as any;
    const fresh = new Set((marked || []).map((t: any) => t.id));
    for (const task of due.filter(t => fresh.has(t.id))) {
      getIO().emit("crmReminder", {
        taskId: task.id,
        userId: task.userId,
        title: task.title,
        type: task.type,
        leadId: task.leadId,
        leadName: task.lead?.name
      });
    }
  } catch (err) {
    logger.warn(`CRM reminder tick failed: ${err}`);
  }
};

export const startCrmReminders = (): void => {
  setInterval(tick, 30000);
};
