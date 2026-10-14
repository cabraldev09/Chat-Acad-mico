import ListWhatsAppsService from "../WhatsappService/ListWhatsAppsService";
import { StartWhatsAppSession } from "./StartWhatsAppSession";
import { logger } from "../../utils/logger";

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// Every QR Code number runs its own Chromium (about 500 MB each). Opening them all at the same
// moment after a restart spikes the memory and gets the container killed, so they start one by one.
// API channels (Cloud API, Telegram, Meta, web chat) cost almost nothing and start at once.
export const StartAllWhatsAppsSessions = async (): Promise<void> => {
  const whatsapps = await ListWhatsAppsService();
  const gap = Number(process.env.WHATSAPP_START_STAGGER_MS ?? 15000);
  const qrSessions = [];

  for (const whatsapp of whatsapps) {
    // lets automated tests run API channels without touching a QR session
    if (process.env.SKIP_WHATSAPP_SESSIONS && whatsapp.channel === "whatsapp") continue;
    if (whatsapp.channel === "whatsapp") qrSessions.push(whatsapp);
    else StartWhatsAppSession(whatsapp);
  }

  // not awaited by the caller: the server is already answering while the sessions open
  (async () => {
    for (let i = 0; i < qrSessions.length; i += 1) {
      if (i > 0) await sleep(gap);
      logger.info(`Starting WhatsApp session ${i + 1} of ${qrSessions.length}: ${qrSessions[i].name}`);
      StartWhatsAppSession(qrSessions[i]);
    }
  })().catch(err => logger.error(err, "Error starting WhatsApp sessions"));
};
