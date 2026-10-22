import { logger } from "../../utils/logger";

// A person often writes several short messages in a row: wait until they stop, then answer once. One timer per key (the ticket);
// a new message restarts it, and a job that is still running makes the next one wait a second.
const timers = new Map<string, NodeJS.Timeout>();
const running = new Set<string>();

export const debounce = (key: string, waitSeconds: number, job: () => Promise<void>): void => {
  const previous = timers.get(key);
  if (previous) clearTimeout(previous);
  timers.set(
    key,
    setTimeout(async () => {
      timers.delete(key);
      if (running.has(key)) {
        debounce(key, 1, job);
        return;
      }
      running.add(key);
      try {
        await job();
      } catch (err) {
        logger.error(`Debounced job ${key} failed: ${err}`);
      } finally {
        running.delete(key);
      }
    }, Math.min(15, Math.max(0, waitSeconds)) * 1000)
  );
};

// A person took the conversation: nothing scheduled for the robot may fire any more
export const cancelDebounce = (keyPrefix: string): void => {
  timers.forEach((timer, key) => {
    if (key === keyPrefix || key.endsWith(`:${keyPrefix}`)) {
      clearTimeout(timer);
      timers.delete(key);
    }
  });
};
