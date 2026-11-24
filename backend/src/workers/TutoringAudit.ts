import { logger } from "../utils/logger";
import { runTutoringAudit } from "../services/TutoriaServices/Issues";

// Every half hour, the cheap reading of the tutoring conversations that have something new (see services/TutoriaServices/Issues).
// One round at a time; the daily limit and the spending caps stop it.
let busy = false;
export const startTutoringAudit = (): void => {
  const every = Number(process.env.TUTORING_AUDIT_MS) || 30 * 60000;
  if (process.env.NODE_ENV === "test" && !process.env.TUTORING_AUDIT_MS) return;
  setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      const run = await runTutoringAudit();
      if (run.read || run.failed) logger.info(`Auditoria da tutoria: ${run.read} lidas, ${run.found} pendências, ${run.resolved} resolvidas, ${run.failed} falhas`);
    } catch (err) {
      logger.warn(`Auditoria da tutoria não rodou: ${(err as Error).message}`);
    } finally {
      busy = false;
    }
  }, every).unref?.();
};
