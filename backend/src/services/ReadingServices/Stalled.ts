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

const isTrue = (v: any): boolean => v === true || v === 1 || v === "1" || v === "t" || v === "true";
export const isStalled = (lastFromMe: any, lastAt: Date | string | null, now = Date.now(), stalledDays = 7, windowDays = 90): boolean => {
  if (!lastAt) return false;
  const fromMe = isTrue(lastFromMe);
  const age = now - new Date(lastAt).getTime();
  return fromMe && age >= days(stalledDays) && age <= days(windowDays);
};

// the last message is the person's, and came after the lead was marked as stalled
export const answeredAfter = (lastFromMe: any, lastAt: Date | string | null, markedAt: Date | string | null): boolean =>
  !!lastAt && lastFromMe !== null && lastFromMe !== undefined && !isTrue(lastFromMe) && new Date(lastAt).getTime() > new Date(markedAt || 0).getTime();

export const markStalled = async (now = Date.now()): Promise<{ marked: number; released: number }> => {
  const stalledDays = Number(process.env.READING_STALLED_DAYS || 7);
  const last = `(SELECT t.lastMessageFromMe FROM Tickets t WHERE t.contactId = l.contactId AND t.isGroup = false AND t.lastMessageAt IS NOT NULL ORDER BY t.lastMessageAt DESC LIMIT 1)`;
  const lastAt = `(SELECT MAX(t.lastMessageAt) FROM Tickets t WHERE t.contactId = l.contactId AND t.isGroup = false)`;
  const open = (await sequelize.query(
    portable(`SELECT l.id, ${last} AS lastFromMe, ${lastAt} AS lastAt FROM Leads l JOIN LeadStages s ON s.id = l.stageId
      WHERE l.isHistorical = false AND l.enrolledAt IS NULL AND l.recoveryState IS NULL AND l.contactId IS NOT NULL AND s.type = 'open' AND s.name <> :confirm
      LIMIT 5000`),
    { replacements: { confirm: CONFIRM_STAGE }, type: QueryTypes.SELECT }
  )) as any[];
  const stalled = open.filter(r => isStalled(r.lastFromMe, r.lastAt, now, stalledDays)).map(r => r.id);
  if (stalled.length) {
    await Lead.update({ recoveryState: "aberta", recoveryAt: new Date(now), recoveryReason: STALLED_REASON } as any, { where: { id: stalled, recoveryState: null } as any });
  }
  // who answered after being marked leaves "Parados"
  const marked = (await sequelize.query(
    portable(`SELECT l.id, l.recoveryAt, ${last} AS lastFromMe, ${lastAt} AS lastAt FROM Leads l
      WHERE l.recoveryState = 'aberta' AND l.recoveryReason = :reason AND l.contactId IS NOT NULL LIMIT 5000`),
    { replacements: { reason: STALLED_REASON }, type: QueryTypes.SELECT }
  )) as any[];
  const back = marked.filter(r => answeredAfter(r.lastFromMe, r.lastAt, r.recoveryAt)).map(r => r.id);
  if (back.length) await Lead.update({ recoveryState: "voltou" } as any, { where: { id: back, recoveryState: "aberta" } as any });
  if (stalled.length || back.length) logger.info(`Recuperação: ${stalled.length} leads parados há ${stalledDays} dias ou mais; ${back.length} voltaram a responder`);
  return { marked: stalled.length, released: back.length };
};
