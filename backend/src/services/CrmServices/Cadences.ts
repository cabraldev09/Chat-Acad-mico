import { QueryTypes } from "sequelize";

import sequelize from "../../database";
import { todayInAppTz } from "../../helpers/AppTime";
import { getSetting } from "../../helpers/AppSettings";
import AutomationTrigger from "../../models/AutomationTrigger";
import LeadReminderLog from "../../models/LeadReminderLog";
import { logger } from "../../utils/logger";
import { emitEvent } from "../FlowServices/Events";
import { runDocumentReminders } from "./Documents";
import { runNpsSurveys } from "./Nps";
import { runRematricula, runRiskScan } from "./Retention";

// Automatic follow-ups on top of the triggers: "a lead stopped for N days" and "the enrollment deadline is N days away".
// The trigger decides which flow talks to the person (and with which words); this only says WHEN. Each lead gets each
// reminder once; a lead that answers can be reminded again in a later silence.

const triggersOf = async (event: string): Promise<AutomationTrigger[]> =>
  AutomationTrigger.findAll({ where: { event, active: true } as any });

const numberOf = (raw: string, key: string): number => {
  try {
    const n = Number(JSON.parse(raw || "{}")[key]);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  } catch (e) {
    return 0;
  }
};

const addDays = (ymd: string, days: number): string => {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

// leads in an open column, with a conversation, who have not written for `days` days (counted from their last message, or from
// their creation) and were not yet reminded in this silence
const idleLeads = async (days: number): Promise<Array<{ id: number; contactId: number | null }>> =>
  sequelize.query(
    `SELECT l.id, l."contactId" FROM "Leads" l
       JOIN "LeadStages" s ON s.id = l."stageId"
      WHERE s.type = 'open' AND l."isHistorical" = false AND l."enrolledAt" IS NULL AND l."lastContactAt" IS NOT NULL
        AND GREATEST(COALESCE(l."lastInboundAt", l."createdAt"), l."createdAt") < now() - make_interval(days => :days)
        AND NOT EXISTS (SELECT 1 FROM "LeadReminderLogs" r WHERE r."leadId" = l.id AND r.key = :key
                         AND r."createdAt" > GREATEST(COALESCE(l."lastInboundAt", l."createdAt"), l."createdAt"))
      ORDER BY l.id LIMIT 50`,
    { replacements: { days, key: `idle:${days}` }, type: QueryTypes.SELECT }
  ) as any;

export const runIdleCadences = async (): Promise<number> => {
  let fired = 0;
  const days = [...new Set((await triggersOf("lead.idle")).map(t => numberOf(t.config, "days")).filter(Boolean))];
  for (const d of days) {
    // eslint-disable-next-line no-await-in-loop
    const leads = await idleLeads(d);
    for (const l of leads) {
      // eslint-disable-next-line no-await-in-loop
      await LeadReminderLog.create({ leadId: l.id, key: `idle:${d}` } as any);
      // eslint-disable-next-line no-await-in-loop
      await emitEvent("lead.idle", { leadId: l.id, contactId: l.contactId, days: d });
      fired += 1;
    }
  }
  return fired;
};

// the deadlines of each entry period, set by the administration: {"2026/2": "2026-12-15"}
export const readDeadlines = async (): Promise<Record<string, string>> => {
  try {
    const raw = JSON.parse(await getSetting("crm_entry_deadlines", "{}"));
    const out: Record<string, string> = {};
    Object.entries(raw || {}).forEach(([term, date]) => { if (/^\d{4}-\d{2}-\d{2}$/.test(String(date))) out[String(term)] = String(date); });
    return out;
  } catch (e) {
    return {};
  }
};

// leads of the period, still in an open column and not enrolled, reminded once when the deadline is `before` days away
export const runDeadlineCadences = async (): Promise<number> => {
  let fired = 0;
  const deadlines = await readDeadlines();
  const befores = [...new Set((await triggersOf("deadline.near")).map(t => numberOf(t.config, "daysBefore")).filter(Boolean))];
  const today = todayInAppTz();
  for (const [term, date] of Object.entries(deadlines)) {
    for (const before of befores) {
      // the day of the reminder, or any later day until the deadline (a server that was off on that day still sends it)
      if (today < addDays(date, -before) || today > date) continue;
      // eslint-disable-next-line no-await-in-loop
      const leads: Array<{ id: number; contactId: number | null }> = (await sequelize.query(
        `SELECT l.id, l."contactId" FROM "Leads" l JOIN "LeadStages" s ON s.id = l."stageId"
          WHERE s.type = 'open' AND l."isHistorical" = false AND l."enrolledAt" IS NULL AND l."entryTerm" = :term
            AND NOT EXISTS (SELECT 1 FROM "LeadReminderLogs" r WHERE r."leadId" = l.id AND r.key = :key)
          ORDER BY l.id LIMIT 100`,
        { replacements: { term, key: `deadline:${term}:${before}` }, type: QueryTypes.SELECT }
      )) as any;
      for (const l of leads) {
        // eslint-disable-next-line no-await-in-loop
        await LeadReminderLog.create({ leadId: l.id, key: `deadline:${term}:${before}` } as any);
        // eslint-disable-next-line no-await-in-loop
        await emitEvent("deadline.near", { leadId: l.id, contactId: l.contactId, daysBefore: before, term });
        fired += 1;
      }
    }
  }
  return fired;
};

export const runCadences = async (): Promise<{ idle: number; deadline: number; documents: number; nps: number; risk: number; rematricula: number }> => {
  const out = { idle: 0, deadline: 0, documents: 0, nps: 0, risk: 0, rematricula: 0 };
  try {
    out.idle = await runIdleCadences();
    out.deadline = await runDeadlineCadences();
    out.documents = await runDocumentReminders();
    out.nps = await runNpsSurveys();
    out.risk = await runRiskScan();
    out.rematricula = await runRematricula();
  } catch (err) {
    logger.warn(`cadences failed: ${(err as Error).message}`);
  }
  return out;
};
