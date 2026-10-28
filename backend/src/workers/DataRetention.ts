import { QueryTypes } from "sequelize";

import sequelize from "../database";
import { getSetting, setSetting } from "../helpers/AppSettings";
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
  { table: "ClientErrors", where: `"createdAt" < NOW() - INTERVAL '{days} days'`, days: 60 },
  { table: "LeadReminderLogs", where: `"createdAt" < NOW() - INTERVAL '{days} days'`, days: 90 },
  { table: "PasswordResets", where: `("usedAt" IS NOT NULL OR "expiresAt" < NOW()) AND "createdAt" < NOW() - INTERVAL '{days} days'`, days: 30 }
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

export const runRetention = async (): Promise<Record<string, number>> => {
  const out: Record<string, number> = {};
  for (const rule of RULES) {
    try {
      // eslint-disable-next-line no-await-in-loop
      out[rule.table] = await prune(rule);
    } catch (err) {
      logger.warn(`Data retention ${rule.table} failed: ${err}`);
    }
  }
  return out;
};

const tick = async (): Promise<void> => {
  try {
    const hour = new Date().getHours();
    const today = new Date().toISOString().slice(0, 10);
    // once a day, in the small hours (the server clock); the date is kept so a restart does not run it twice
    if (hour < 3 || hour > 5 || (await getSetting("retention_last_run", "")) === today) return;
    await setSetting("retention_last_run", today);
    const done = await runRetention();
    const text = Object.entries(done).filter(([, n]) => n > 0).map(([t, n]) => `${t}: ${n}`).join(", ");
    logger.info(`Data retention: ${text || "nothing to trim"}`);
  } catch (err) {
    logger.warn(`Data retention failed: ${err}`);
  }
};

export const startDataRetention = (): void => {
  setInterval(tick, Number(process.env.DATA_RETENTION_MS) || 30 * 60000);
};
