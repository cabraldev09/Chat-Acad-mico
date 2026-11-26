import { QueryTypes } from "sequelize";

import sequelize from "../database";
import { getSetting, setSetting } from "../helpers/AppSettings";
import { getAppTz } from "../helpers/AppTime";
import { logger } from "../utils/logger";
import { runContentRetention } from "../services/SystemServices/ContentRetention";

// The tables that only grow (a copy of every send, every model call, every error) are trimmed once a night, in small batches so the
// database is never locked for long. Nothing the screens, the reports or the audit trail of a student need is touched: conversations,
// messages, leads, tasks, enrollments and the activity history stay as they are. The CONTENT of old conversations and old voice notes
// only goes when the administrator turns that rule on (off by default; see services/SystemServices/ContentRetention).
interface Rule {
  table: string;
  // the condition of what may go; {days} is replaced by the age
  where: string;
  days: number;
}

export const RULES: Rule[] = [
  // the copy of what a person sent is kept in Messages; this table is only the delivery queue and its result
  { table: "OutboundMessages", where: `status = 'sent' AND "sentAt" < NOW() - INTERVAL '{days} days'`, days: 120 },
  { table: "AgentTurnLogs", where: `"createdAt" < NOW() - INTERVAL '{days} days'`, days: 180 },
  { table: "AiUsage", where: `"createdAt" < NOW() - INTERVAL '{days} days'`, days: 400 },
  // "Ver o que o robô fez": what the automation decided, for the conversations of the last months
  { table: "AutomationTraces", where: `"createdAt" < NOW() - INTERVAL '{days} days'`, days: 90 },
  { table: "ClientErrors", where: `"createdAt" < NOW() - INTERVAL '{days} days'`, days: 60 },
  { table: "LeadReminderLogs", where: `"createdAt" < NOW() - INTERVAL '{days} days'`, days: 90 },
  { table: "PasswordResets", where: `("usedAt" IS NOT NULL OR "expiresAt" < NOW()) AND "createdAt" < NOW() - INTERVAL '{days} days'`, days: 30 },
  // Webhook bodies can contain conversation content: keep completed and terminal failures for review for at most seven days.
  // what the daily review of the AI read: the trends of a year are enough for the training of the team
  { table: "ConsultantReviews", where: `"createdAt" < NOW() - INTERVAL '{days} days'`, days: 400 },
  // the ledger of each send (dedupe key and estimated cost): the daily budget reads only today; a finished send is history after a few months
  { table: "OutboundDeliveries", where: `status <> 'sending' AND "updatedAt" < NOW() - INTERVAL '{days} days'`, days: 120 },
  // the log of the webhooks delivered to other systems: only the ones that ended (delivered, failed for good, cancelled)
  { table: "WebhookDeliveries", where: `status NOT IN ('pending', 'sending') AND "createdAt" < NOW() - INTERVAL '{days} days'`, days: 30 },
  // the notices of the bell: the read ones after a month, any after three
  { table: "Notifications", where: `("readAt" IS NOT NULL AND "readAt" < NOW() - INTERVAL '{days} days') OR "createdAt" < NOW() - INTERVAL '90 days'`, days: 30 },
  // the recommendations of the OpenBot: dismissed or expired ones go after a month
  { table: "OpenbotInsights", where: `("resolvedAt" IS NOT NULL AND "resolvedAt" < NOW() - INTERVAL '{days} days') OR "expiresAt" < NOW() - INTERVAL '{days} days'`, days: 30 },
  { table: "MetaWebhookEvents", where: `status IN ('done', 'failed') AND "updatedAt" < NOW() - INTERVAL '{days} days'`, days: 7 }
];

const BATCH = 2000;
const MAX_BATCHES = 25;

export const prune = async (rule: Rule): Promise<number> => {
  const where = rule.where.replace("{days}", String(Math.max(1, Math.round(rule.days))));
  let total = 0;
  for (let i = 0; i < MAX_BATCHES; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const [, meta]: any = await sequelize.query(`DELETE FROM "${rule.table}" WHERE id IN (SELECT id FROM "${rule.table}" WHERE ${where} LIMIT ${BATCH})`, { type: QueryTypes.RAW });
    const n = Number(meta?.rowCount ?? 0);
    total += n;
    if (n < BATCH) break;
    // eslint-disable-next-line no-await-in-loop
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  return total;
};

// what each table trimmed, and the tables that failed (the day only counts as done when none failed)
export const runRetention = async (): Promise<{ trimmed: Record<string, number>; failed: string[] }> => {
  const trimmed: Record<string, number> = {};
  const failed: string[] = [];
  for (const rule of RULES) {
    try {
      // eslint-disable-next-line no-await-in-loop
      trimmed[rule.table] = await prune(rule);
    } catch (err) {
      failed.push(rule.table);
      logger.warn(`Data retention ${rule.table} failed: ${err}`);
    }
  }
  return { trimmed, failed };
};

const tick = async (): Promise<void> => {
  try {
    // once a day, in the small hours of the company's time zone (not the server's clock); the date is saved only once it worked, so a
    // failure is tried again in the next half hour and a restart does not run it twice
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: getAppTz(), year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
    const part = (t: string) => (parts.find(p => p.type === t) || { value: "" }).value;
    const hour = Number(part("hour"));
    const today = `${part("year")}-${part("month")}-${part("day")}`;
    if (hour < 3 || hour > 5 || (await getSetting("retention_last_run", "")) === today) return;
    const { trimmed, failed } = await runRetention();
    // the content of old conversations and old voice notes: only when the administrator turned the rule on (off by default)
    const content = await runContentRetention().catch(err => {
      logger.warn(`Retenção de conversas e áudios falhou: ${err}`);
      return { ran: true, failed: true, audioFiles: 0, conversations: 0, conversationMessages: 0, filesDeleted: 0 };
    });
    if (content.failed) failed.push("conteúdo das conversas");
    // a table that failed is tried again in the next half hour (the day is not marked as done)
    if (!failed.length) await setSetting("retention_last_run", today);
    const text = Object.entries(trimmed).filter(([, n]) => n > 0).map(([t, n]) => `${t}: ${n}`).join(", ");
    const contentText = content.ran ? `; conversas: ${content.conversations} (${content.conversationMessages} mensagens), áudios: ${content.audioFiles}, arquivos apagados: ${content.filesDeleted}` : "";
    logger.info(`Data retention: ${text || "nothing to trim"}${contentText}${failed.length ? ` (falharam: ${failed.join(", ")}; nova tentativa em 30 min)` : ""}`);
  } catch (err) {
    logger.warn(`Data retention failed: ${err}`);
  }
};

export const startDataRetention = (): void => {
  setInterval(tick, Number(process.env.DATA_RETENTION_MS) || 30 * 60000);
};
