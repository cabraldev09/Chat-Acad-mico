import { runCadences } from "../services/CrmServices/Cadences";
import { logger } from "../utils/logger";

let busy = false;

// every ten minutes: the follow-ups of the leads that stopped and the reminders of the enrollment deadline
export const startCadences = (): void => {
  setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      await runCadences();
    } catch (err) {
      logger.warn(`Cadences worker error: ${err}`);
    } finally {
      busy = false;
    }
  }, 10 * 60 * 1000);
};
