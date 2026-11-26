import { QueryTypes } from "sequelize";

import sequelize from "../../database";
import { portable } from "../../helpers/sqlDialect";
import Lead from "../../models/Lead";
import { logger } from "../../utils/logger";

// "Parados" in Recuperação without a new reading: once a day, a lead still in the funnel whose last message (of all its conversations)
// was the team's, unanswered for STALLED_DAYS (7) and not older than the 90 days of the copy, goes to Recuperação as "Parou de
// responder". When the person writes again, it leaves by itself (recoveryState "voltou"). Nothing is sent to anyone.
export const STALLED_REASON = "Parou de responder";
const CONFIRM_STAGE = "Matrícula a confirmar";
const days = (n: number) => n * 864e5;

export const markStalled = async (now = Date.now()): Promise<{ marked: number; released: number }> => {
  const stalledDays = Number(process.env.READING_STALLED_DAYS || 7);
  const last = `(SELECT t.lastMessageFromMe FROM Tickets t WHERE t.contactId = l.contactId AND t.isGroup = false AND t.lastMessageAt IS NOT NULL ORDER BY t.lastMessageAt DESC LIMIT 1)`;
  const lastAt = `(SELECT MAX(t.lastMessageAt) FROM Tickets t WHERE t.contactId = l.contactId AND t.isGroup = false)`;
  // only a real person in the funnel (never the team, a personal contact, a channel or a broadcast list: the same rule of LeadQueue),
  // filtered in the database before the limit, so every stalled lead is reached whatever the size of the funnel
  const rows = (await sequelize.query(
    portable(`SELECT x.id FROM (
        SELECT l.id, ${last} AS lastFromMe, ${lastAt} AS lastAt FROM Leads l JOIN LeadStages s ON s.id = l.stageId JOIN Contacts ct ON ct.id = l.contactId
        WHERE l.isHistorical = false AND l.enrolledAt IS NULL AND l.recoveryState IS NULL AND s.type = 'open' AND s.name <> :confirm
          AND ct.isStaff = false AND ct.isPersonal = false AND COALESCE(ct.kind, 'person') = 'person' AND COALESCE(ct.noReply, false) = false
      ) x WHERE x.lastFromMe = true AND x.lastAt <= :until AND x.lastAt >= :since LIMIT 5000`),
    { replacements: { confirm: CONFIRM_STAGE, until: new Date(now - days(stalledDays)), since: new Date(now - days(90)) }, type: QueryTypes.SELECT }
  )) as any[];
  const stalled = rows.map(r => r.id);
  if (stalled.length) {
    await Lead.update({ recoveryState: "aberta", recoveryAt: new Date(now), recoveryReason: STALLED_REASON } as any, { where: { id: stalled, recoveryState: null } as any });
  }
  // the person wrote anything after being marked (even if the team answered after it): out of "Parados"
  const back = ((await sequelize.query(
    portable(`SELECT l.id FROM Leads l WHERE l.recoveryState = 'aberta' AND l.recoveryReason = :reason AND l.contactId IS NOT NULL
      AND EXISTS (SELECT 1 FROM Messages m WHERE m.contactId = l.contactId AND m.fromMe = false AND m.createdAt > l.recoveryAt) LIMIT 5000`),
    { replacements: { reason: STALLED_REASON }, type: QueryTypes.SELECT }
  )) as any[]).map(r => r.id);
  if (back.length) await Lead.update({ recoveryState: "voltou" } as any, { where: { id: back, recoveryState: "aberta" } as any });
  if (stalled.length || back.length) logger.info(`Recuperação: ${stalled.length} leads parados há ${stalledDays} dias ou mais; ${back.length} voltaram a responder`);
  return { marked: stalled.length, released: back.length };
};
