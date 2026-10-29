import { createHmac } from "crypto";
import { Op } from "sequelize";
import Webhook from "../../models/Webhook";
import Delivery from "../../models/WebhookDelivery";
import { safeRequest } from "../../helpers/SafeUrl";
import { afterCommit } from "../../helpers/TransactionContext";
import { logger } from "../../utils/logger";

export const WEBHOOK_EVENTS = ["message.received", "message.sent", "ticket.created", "ticket.updated", "ticket.closed", "contact.created", "lead.created", "lead.updated", "lead.stage_changed", "lead.won", "lead.lost", "lead.enrolled", "onboarding.done", "proposal.sent", "proposal.viewed", "payment.paid", "ai.handoff", "ai.unknown_question"];
let busy = false;

// Enqueue in the caller's transaction. Delivery failures never roll back business data.
const dispatchWebhook = async (event: string, data: unknown): Promise<void> => {
  const hooks = await Webhook.findAll({ where: { active: true } });
  const targets = hooks.filter(h => {
    try { const events = JSON.parse(h.events); return events.includes(event) || events.includes("*"); } catch (_) { return false; }
  });
  if (!targets.length) return;
  const payload = JSON.stringify({ event, timestamp: new Date().toISOString(), data });
  await Delivery.bulkCreate(targets.map(hook => ({ webhookId: hook.id, payload, status: "pending", attempts: 0, nextAttemptAt: new Date() })));
  afterCommit(() => { processWebhookQueue().catch(err => logger.warn(`Webhook queue: ${err.message}`)); });
};

export const processWebhookQueue = async (): Promise<void> => {
  if (busy) return;
  busy = true;
  try {
    // A process may have stopped during delivery. The receiver deduplicates by delivery id.
    await Delivery.update({ status: "pending", claimedAt: null }, { where: { status: "sending", claimedAt: { [Op.lt]: new Date(Date.now() - 60000) } } });
    const rows = await Delivery.findAll({ where: { status: "pending", nextAttemptAt: { [Op.lte]: new Date() } }, order: [["nextAttemptAt", "ASC"]], limit: 20 });
    for (const row of rows) {
      const [claimed] = await Delivery.update({ status: "sending", claimedAt: new Date() }, { where: { id: row.id, status: "pending" } });
      if (!claimed) continue;
      const hook = await Webhook.findByPk(row.webhookId);
      if (!hook?.active) { await row.update({ status: "cancelled" }); continue; }
      const payload = JSON.parse(row.payload);
      const headers: Record<string, string> = { "Content-Type": "application/json", "X-Whaticket-Event": payload.event, "X-Whaticket-Delivery": String(row.id) };
      if (hook.secret) headers["X-Whaticket-Signature"] = `sha256=${createHmac("sha256", hook.secret).update(row.payload).digest("hex")}`;
      let status = 0;
      let error: string | null = null;
      try {
        const response = await safeRequest({ url: hook.url, method: "POST", data: row.payload, headers, timeout: 10000, validateStatus: () => true, maxContentLength: 65536 });
        status = response.status;
        if (status < 200 || status >= 300) error = `HTTP ${status}`;
      } catch (err) { error = String(err.message).slice(0, 500); }
      const attempts = row.attempts + 1;
      await row.update({ status: !error ? "delivered" : attempts >= 8 ? "failed" : "pending", attempts, claimedAt: null, lastError: error, nextAttemptAt: new Date(Date.now() + Math.min(3600000, 5000 * 2 ** attempts)) });
      await hook.update({ lastStatus: status, lastError: error, lastAt: new Date() });
    }
    // Retain delivery diagnostics for 30 days, then bound queue storage growth.
    await Delivery.destroy({ where: { status: { [Op.in]: ["delivered", "cancelled"] }, updatedAt: { [Op.lt]: new Date(Date.now() - 30 * 86400000) } } });
  } finally { busy = false; }
};
export const startWebhookQueue = (): void => {
  processWebhookQueue().catch(err => logger.warn(`Webhook queue: ${err.message}`));
  setInterval(() => processWebhookQueue().catch(err => logger.warn(`Webhook queue: ${err.message}`)), 5000);
};
export default dispatchWebhook;
