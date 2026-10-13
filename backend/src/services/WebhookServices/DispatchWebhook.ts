import axios from "axios";
import { createHmac } from "crypto";

import Webhook from "../../models/Webhook";
import { logger } from "../../utils/logger";

export const WEBHOOK_EVENTS = [
  "message.received",
  "message.sent",
  "ticket.created",
  "ticket.updated",
  "ticket.closed",
  "contact.created",
  "lead.created",
  "lead.updated",
  "lead.stage_changed",
  "lead.won",
  "lead.lost",
  "proposal.sent",
  "proposal.viewed",
  "payment.paid"
];

const dispatchWebhook = (event: string, data: unknown): void => {
  // fire and forget; never block message flow on a slow receiver
  (async () => {
    const hooks = await Webhook.findAll({ where: { active: true } });
    const targets = hooks.filter(h => {
      try {
        const events: string[] = JSON.parse(h.events);
        return events.includes(event) || events.includes("*");
      } catch (e) {
        return false;
      }
    });
    if (!targets.length) return;

    const payload = JSON.stringify({
      event,
      timestamp: new Date().toISOString(),
      data
    });

    await Promise.all(
      targets.map(async hook => {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          "X-Whaticket-Event": event
        };
        if (hook.secret) {
          headers["X-Whaticket-Signature"] = `sha256=${createHmac(
            "sha256",
            hook.secret
          )
            .update(payload)
            .digest("hex")}`;
        }
        try {
          const res = await axios.post(hook.url, payload, {
            headers,
            timeout: 10000,
            validateStatus: () => true
          });
          await hook.update({
            lastStatus: res.status,
            lastError: res.status >= 400 ? `HTTP ${res.status}` : null,
            lastAt: new Date()
          });
        } catch (err) {
          await hook.update({
            lastStatus: 0,
            lastError: String(err.message || err).slice(0, 500),
            lastAt: new Date()
          });
        }
      })
    );
  })().catch(err => logger.warn(`Webhook dispatch error: ${err}`));
};

export default dispatchWebhook;
