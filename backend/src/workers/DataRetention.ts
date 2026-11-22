import { QueryTypes } from "sequelize";

import sequelize from "../database";
import { getSetting, setSetting } from "../helpers/AppSettings";
import { getAppTz } from "../helpers/AppTime";
import { logger } from "../utils/logger";

// The tables that only grow (a copy of every send, every model call, every error) are trimmed once a night, in small batches so the
// database is never locked for long. Nothing the screens, the reports or the audit trail of a student need is touched: conversations,
// messages, leads, tasks, enrollments and the activity history stay as they are.
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
    // a table that failed is tried again in the next half hour (the day is not marked as done)
    if (!failed.length) await setSetting("retention_last_run", today);
    const text = Object.entries(trimmed).filter(([, n]) => n > 0).map(([t, n]) => `${t}: ${n}`).join(", ");
    logger.info(`Data retention: ${text || "nothing to trim"}${failed.length ? ` (falharam: ${failed.join(", ")}; nova tentativa em 30 min)` : ""}`);
  } catch (err) {
    logger.warn(`Data retention failed: ${err}`);
  }
};

export const startDataRetention = (): void => {
  setInterval(tick, Number(process.env.DATA_RETENTION_MS) || 30 * 60000);
};
