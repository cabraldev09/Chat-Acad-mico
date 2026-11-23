import { Op } from "sequelize";

import LeadTask from "../models/LeadTask";
import Lead from "../models/Lead";
import { getIO } from "../libs/socket";
import { notify } from "../services/NotificationServices/Notify";
import { logger } from "../utils/logger";

// 15 minutes before a task of a person is due, a notice in the bell (once per task: the notice's key)
const soon = async (): Promise<void> => {
  const now = new Date();
  const tasks = await LeadTask.findAll({
    where: { doneAt: null as any, notifiedAt: null as any, userId: { [Op.ne]: null } as any, dueAt: { [Op.gt]: now, [Op.lte]: new Date(now.getTime() + 15 * 60000) } },
    include: [{ model: Lead, as: "lead", attributes: ["id", "name"] }],
    limit: 50
  });
  for (const t of tasks) {
    // eslint-disable-next-line no-await-in-loop
    await notify([t.userId], { kind: "task_soon", level: t.priority === "high" ? "warning" : "info", title: `Em 15 min: ${t.title}`, body: t.lead ? t.lead.name : null, link: t.ticketId ? `/tickets/${t.ticketId}` : "/crm/tarefas?status=today", dedupeKey: `task-soon:${t.id}` });
  }
};

// Pushes a socket notification for every follow-up task that just became due
const tick = async (): Promise<void> => {
  try {
    const due = await LeadTask.findAll({
      where: { doneAt: null as any, notifiedAt: null as any, dueAt: { [Op.lte]: new Date() } },
      include: [{ model: Lead, as: "lead", attributes: ["id", "name"] }],
      limit: 50
    });
    await soon().catch(err => logger.warn(`Pré-aviso de tarefas: ${err}`));
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
