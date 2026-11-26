import Whatsapp from "../models/Whatsapp";
import { logger } from "../utils/logger";

const EVERY_MS = 6 * 3600 * 1000;
let running = false;

// Every 6 hours each connected QR Code number reads its phone again (CompletePhoneNames.syncPhoneContacts): a person saved on the phone
// since the last connection, or who now shows a profile name, stops being only a number in the lists. One number at a time.
export const runPhoneNamesSync = async (): Promise<void> => {
  if (running) return;
  running = true;
  try {
    const { syncPhoneContacts } = await import("../services/WbotServices/CompletePhoneNames");
    const numbers = await Whatsapp.findAll({ where: { status: "CONNECTED", channel: "whatsapp" }, order: [["id", "ASC"]] });
    for (const whatsapp of numbers) {
      // eslint-disable-next-line no-await-in-loop
      await syncPhoneContacts(whatsapp).catch(err => logger.warn(`Phone names of ${whatsapp.id} not read: ${err}`));
    }
  } finally {
    running = false;
  }
};

export const startPhoneNamesSync = (): void => {
  setInterval(() => { runPhoneNamesSync().catch(() => undefined); }, EVERY_MS);
};
