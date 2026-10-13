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
    for (const task of due) {
      // eslint-disable-next-line no-await-in-loop
      await task.update({ notifiedAt: new Date() });
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
