import { logger } from "../utils/logger";
import { releaseUnreachableTasks, syncHandoffTasks } from "../services/CrmServices/HandoffTasks";
import { redistributeUnreachableTickets } from "../services/AutomationServices/AutoAssignTicket";

// Every 30 minutes: conversations with someone who cannot answer (no WhatsApp number) go to a colleague, and every open task follows whoever answers its lead.
// Order matters: the conversations move first, so the tasks follow them in the same round.
export const runTaskSweep = async (): Promise<{ redistributed: number; aligned: number; moved: number; released: number }> => {
  const redistributed = await redistributeUnreachableTickets();
  const aligned = await syncHandoffTasks();
  const { moved, released } = await releaseUnreachableTasks();
  return { redistributed, aligned, moved, released };
};

export const startTaskSweep = (): void => {
  const run = () => runTaskSweep().then(r => { if (r.redistributed || r.aligned || r.moved || r.released) logger.info(`Task sweep: ${JSON.stringify(r)}`); }).catch(err => logger.warn(`task sweep failed: ${err}`));
  const every = Number(process.env.TASK_SWEEP_MS) || 30 * 60 * 1000;
  setTimeout(run, Math.min(60 * 1000, every));
  setInterval(run, every);
};
