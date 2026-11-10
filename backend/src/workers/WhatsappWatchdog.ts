import fs from "fs";
import path from "path";

import { WWEBJS_AUTH_DIR } from "../config/paths";
import Whatsapp from "../models/Whatsapp";
import { reconcileStatuses, sessionHealth, sessionWatch } from "../providers/WhatsApp/Implementations/wwebjs";
import { StartWhatsAppSession } from "../services/WbotServices/StartWhatsAppSession";
import { logger } from "../utils/logger";

// The last line of defence of "always receiving": the provider retries on its own (see wwebjs.ts), and this looks at the database every few
// minutes for what slipped through (a process that lost its timers, a session that gave up long ago while its login is still saved):
//   - opening / timeout for more than 8 minutes with nothing in progress → open it again;
//   - connected in the database but without a live session in this process → open it again;
//   - disconnected for more than 30 minutes with a saved login → one more try (never faster: hammering WhatsApp is a ban signal).
const STUCK_MIN = 8;
const DEAD_MIN = 30;
const lastTry = new Map<number, number>();
// the sessions are opened one by one when the server starts: the watchdog waits for them
const bootAt = Date.now();
const GRACE_MS = Number(process.env.WHATSAPP_WATCHDOG_GRACE_MS ?? 5 * 60000);

const hasLogin = (id: number): boolean => {
  try {
    return fs.existsSync(path.join(WWEBJS_AUTH_DIR, `session-bd_${id}`, "Default"));
  } catch (e) {
    return false;
  }
};

const tick = async (): Promise<void> => {
  try {
    if (process.env.SKIP_WHATSAPP_SESSIONS) return;
    // first of all: a number that is really connected must never show as fallen (this also runs during the grace time after a restart)
    await reconcileStatuses();
    // one line per number: registered / ready / state / injected (the proof that a number can really read and send)
    sessionHealth().then(list => list.forEach(h => logger.info(`WhatsApp health: sessão ${h.id} registered=${h.registered} ready=${h.ready} state=${h.state} injected=${h.injected}`))).catch(() => undefined);
    if (Date.now() - bootAt < GRACE_MS) return;
    const rows = await Whatsapp.findAll({ where: { channel: "whatsapp" } as any });
    const now = Date.now();
    for (const w of rows) {
      const minutes = w.statusSince ? (now - new Date(w.statusSince).getTime()) / 60000 : 0;
      const watch = sessionWatch(w.id);
      const recently = now - (lastTry.get(w.id) || 0) < 10 * 60000;
      let why = "";
      if ((w.status === "OPENING" || w.status === "TIMEOUT") && minutes > STUCK_MIN && !watch.initializing) why = `${w.status === "TIMEOUT" ? "sem resposta" : "abrindo"} há ${Math.round(minutes)} min`;
      else if (w.status === "CONNECTED" && !watch.live && minutes > 5) why = "conectada no banco, mas sem sessão ativa neste servidor";
      else if (w.status === "DISCONNECTED" && minutes > DEAD_MIN && !watch.initializing && hasLogin(w.id) && now - (lastTry.get(w.id) || 0) > DEAD_MIN * 60000) why = `desconectada há ${Math.round(minutes)} min com o login salvo`;
      if (!why || (recently && w.status !== "DISCONNECTED")) continue;
      lastTry.set(w.id, now);
      logger.warn(`WhatsApp watchdog: ${w.name} ${why}. Reabrindo.`);
      // eslint-disable-next-line no-await-in-loop
      await StartWhatsAppSession(w);
    }
  } catch (err) {
    logger.warn(`WhatsApp watchdog tick failed: ${err}`);
  }
};

export const startWhatsappWatchdog = (): void => {
  setInterval(tick, Number(process.env.WHATSAPP_WATCHDOG_MS) || 3 * 60000);
  // right after the server starts the sessions come back one by one: look once early, so a recovered number does not show as fallen for minutes
  setTimeout(() => reconcileStatuses().catch(() => undefined), 45000);
};

export { tick as runWhatsappWatchdogOnce };
