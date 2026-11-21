import { createHash } from "crypto";
import { Op } from "sequelize";

import MetaWebhookEvent from "../../models/MetaWebhookEvent";
import Whatsapp from "../../models/Whatsapp";
import { getConfig } from "../../channels/types";
import { logger } from "../../utils/logger";

// The webhooks of the Meta are stored before the 200 (see the routes) and processed here: right away, and again every few seconds for
// what failed or was left behind by a restart. Up to 5 tries, waiting longer each time; a message already saved is skipped by its id.
const MAX_ATTEMPTS = 5;
const STUCK_MS = 2 * 60000;

export const webhookKey = (whatsappId: number | null, raw: Buffer | string | undefined, body: unknown): string =>
  createHash("sha256").update(`${whatsappId || "app"}:`).update(raw && (raw as any).length ? (raw as any) : JSON.stringify(body || {})).digest("hex");

// stores the delivery (a repeated one is the same row) and says whether it is new
export const storeWebhook = async (whatsappId: number | null, raw: Buffer | undefined, body: unknown): Promise<MetaWebhookEvent> => {
  const key = webhookKey(whatsappId, raw, body);
  const [row] = await MetaWebhookEvent.findOrCreate({
    where: { key },
    defaults: { key, whatsappId, body: JSON.stringify(body || {}), status: "pending", attempts: 0, nextAt: new Date() } as any
  });
  return row;
};

// the app webhook (Instagram by login): each entry goes to the connection of its account
const processApp = async (body: any): Promise<void> => {
  const { processMetaWebhook } = await import("../../channels/meta");
  const connections = await Whatsapp.findAll({ where: { channel: "instagram" } as any });
  let first: unknown = null;
  for (const entry of body?.entry || []) {
    const whatsapp = connections.find(w => {
      const c = getConfig(w);
      return c.mode === "oauth" && String(c.igUserId) === String(entry.id);
    });
    if (!whatsapp) {
      logger.warn(`Meta app webhook: no connection for account ${entry.id}`);
      continue;
    }
    try {
      // eslint-disable-next-line no-await-in-loop
      await processMetaWebhook(whatsapp, { entry: [entry] }, true);
    } catch (err) {
      if (!first) first = err;
    }
  }
  if (first) throw first;
};

export const processEvent = async (id: number): Promise<void> => {
  // claimed by one worker only: a slow event is not processed twice
  const [claimed] = await MetaWebhookEvent.update({ status: "processing" } as any, { where: { id, status: "pending" } as any });
  if (!claimed) return;
  const row = await MetaWebhookEvent.findByPk(id);
  if (!row) return;
  try {
    const body = JSON.parse(row.body || "{}");
    if (row.whatsappId) {
      const whatsapp = await Whatsapp.findByPk(row.whatsappId);
      // the connection was removed: nothing to deliver to
      if (whatsapp) {
        const { processMetaWebhook } = await import("../../channels/meta");
        await processMetaWebhook(whatsapp, body, true);
      }
    } else await processApp(body);
    await MetaWebhookEvent.update({ status: "done", processedAt: new Date(), error: null } as any, { where: { id } });
  } catch (err) {
    const attempts = (row.attempts || 0) + 1;
    const last = attempts >= MAX_ATTEMPTS;
    logger.warn(`Meta webhook ${id} failed (attempt ${attempts}${last ? ", giving up" : ""}): ${(err as Error)?.message || err}`);
    await MetaWebhookEvent.update(
      { status: last ? "failed" : "pending", attempts, error: String((err as Error)?.message || err).slice(0, 500), nextAt: new Date(Date.now() + 10000 * 2 ** attempts) } as any,
      { where: { id } }
    );
  }
};

// processes now, without waiting for the sweep (the route calls this after the 200)
export const kickWebhook = (id: number): void => {
  processEvent(id).catch(err => logger.error(`Meta webhook ${id}: ${err}`));
};

let running = false;
export const sweepWebhooks = async (): Promise<void> => {
  if (running) return;
  running = true;
  try {
    // left in "processing" by a restart in the middle: back to the queue
    await MetaWebhookEvent.update({ status: "pending" } as any, { where: { status: "processing", updatedAt: { [Op.lt]: new Date(Date.now() - STUCK_MS) } } as any });
    const due = await MetaWebhookEvent.findAll({ where: { status: "pending", nextAt: { [Op.lte]: new Date() } } as any, order: [["id", "ASC"]], limit: 20, attributes: ["id"] });
    for (const row of due) {
      // eslint-disable-next-line no-await-in-loop
      await processEvent(row.id);
    }
  } catch (err) {
    logger.error(`Meta webhook sweep: ${err}`);
  } finally {
    running = false;
  }
};

export const startMetaWebhookQueue = (): void => {
  sweepWebhooks().catch(() => undefined);
  setInterval(sweepWebhooks, Number(process.env.META_WEBHOOK_SWEEP_MS) || 10000);
};
