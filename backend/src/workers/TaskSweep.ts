import { logger } from "../utils/logger";
import { releaseUnreachableTasks, syncHandoffTasks } from "../services/CrmServices/HandoffTasks";
import { redistributeUnreachableTickets } from "../services/AutomationServices/AutoAssignTicket";

// Every 5 minutes: conversations with someone who cannot answer (no WhatsApp number) go to a colleague, and every open task follows whoever answers its lead.
// Order matters: the conversations move first, so the tasks follow them in the same round.
export const runTaskSweep = async (): Promise<{ redistributed: number; aligned: number; moved: number; released: number }> => {
  const redistributed = await redistributeUnreachableTickets();
  const aligned = await syncHandoffTasks();
  const { moved, released } = await releaseUnreachableTasks();
  await warnUnassigned().catch(err => logger.warn(`Aviso de trabalho sem responsável: ${err}`));
  return { redistributed, aligned, moved, released };
};

// work nobody has for more than 30 minutes (tasks without a person, conversations waiting with no attendant and no AI): the management
// is told in the bell, at most once an hour
export const warnUnassigned = async (): Promise<number> => {
  const { QueryTypes } = await import("sequelize");
  const sequelize = (await import("../database")).default;
  const [row] = (await sequelize.query(`SELECT
      (SELECT COUNT(*) FROM "LeadTasks" WHERE "userId" IS NULL AND "doneAt" IS NULL AND "createdAt" < NOW() - INTERVAL '30 minutes') AS tasks,
      (SELECT COUNT(*) FROM "Tickets" WHERE status = 'pending' AND "userId" IS NULL AND "aiActive" IS NOT TRUE AND "isGroup" = false AND "isHistorical" = false
         AND "archivedAt" IS NULL AND "lastMessageFromMe" = false AND COALESCE("lastMessageAt", "updatedAt") < NOW() - INTERVAL '30 minutes') AS tickets`, { type: QueryTypes.SELECT })) as any[];
  const tasks = Number(row?.tasks || 0);
  const tickets = Number(row?.tickets || 0);
  if (!tasks && !tickets) return 0;
  const { notifyManagers } = await import("../services/NotificationServices/Notify");
  const parts = [tickets ? `${tickets} conversa(s) esperando sem atendente` : "", tasks ? `${tasks} tarefa(s) sem responsável` : ""].filter(Boolean);
  return notifyManagers({ kind: "unassigned", level: "warning", title: "Trabalho sem responsável há mais de 30 minutos", body: `${parts.join(" e ")}. Distribua para alguém da equipe.`, link: tickets ? "/tickets" : "/crm/tarefas?scope=all", dedupeKey: `unassigned:${new Date().toISOString().slice(0, 13)}` });
};

export const startTaskSweep = (): void => {
  const run = () => runTaskSweep().then(r => { if (r.redistributed || r.aligned || r.moved || r.released) logger.info(`Task sweep: ${JSON.stringify(r)}`); }).catch(err => logger.warn(`task sweep failed: ${err}`));
  const every = Number(process.env.TASK_SWEEP_MS) || 5 * 60 * 1000;
  setTimeout(run, Math.min(60 * 1000, every));
  setInterval(run, every);
};
