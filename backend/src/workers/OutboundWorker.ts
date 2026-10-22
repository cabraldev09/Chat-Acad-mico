import { sweepOutbound } from "../services/MessageServices/OutboundService";
import { logger } from "../utils/logger";

let running = false;

// What a person sent is already stored (and the conversation already theirs): this picks up whatever was not delivered at once.
export const startOutboundWorker = (): void => {
  setInterval(async () => {
    if (running) return;
    running = true;
    try {
      await sweepOutbound();
    } catch (err) {
      logger.error(`Outbound worker: ${err}`);
    } finally {
      running = false;
    }
  }, 5000);
};
