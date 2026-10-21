import { logger } from "../utils/logger";

// A worker that takes longer than its interval must not start a second round on top of the first one (two rounds read the same rows before either
// writes its mark: the same reminder twice, the same task twice). The next tick simply waits for the previous one to finish.
export const workerStats = new Map<string, { runs: number; skipped: number; lastRunAt: number | null; lastError: string | null }>();

export const guardedInterval = (name: string, fn: () => Promise<unknown> | unknown, ms: number): NodeJS.Timeout => {
  let busy = false;
  const stat = { runs: 0, skipped: 0, lastRunAt: null as number | null, lastError: null as string | null };
  workerStats.set(name, stat);
  return setInterval(async () => {
    if (busy) {
      stat.skipped += 1;
      return;
    }
    busy = true;
    try {
      await fn();
      stat.lastError = null;
    } catch (err) {
      stat.lastError = String((err as Error)?.message || err).slice(0, 200);
      logger.warn(`Worker ${name} failed: ${stat.lastError}`);
    } finally {
      stat.runs += 1;
      stat.lastRunAt = Date.now();
      busy = false;
    }
  }, ms);
};
