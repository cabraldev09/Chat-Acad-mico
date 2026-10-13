import { pollPendingPayments } from "../services/PaymentServices/EnrollmentPayments";
import { logger } from "../utils/logger";

let busy = false;

export const startPaymentPoller = (): void => {
  const every = Number(process.env.EFI_POLL_MS) || 30000;
  setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      await pollPendingPayments();
    } catch (err) {
      logger.warn(`Payment poller error: ${err}`);
    } finally {
      busy = false;
    }
  }, every);
};
