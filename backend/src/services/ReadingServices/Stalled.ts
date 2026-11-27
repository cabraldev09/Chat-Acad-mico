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
  // a conversation copied from the phone still waiting for the AI's reading: the reading decides (lead, friend, team, its stage), not this
  const waitingReading = `SELECT 1 FROM ConversationReadings r JOIN Tickets rt ON rt.id = r.ticketId WHERE rt.contactId = l.contactId AND r.kind = 'importacao' AND r.status IN ('pendente', 'reservada')`;
  // the AI's last word on the copied conversation (ConversationReadings.result, see ReadingServices/Queue): not a lead (team, partner, other)
  const doneReading = (cond: string) => `SELECT 1 FROM ConversationReadings r JOIN Tickets rt ON rt.id = r.ticketId WHERE rt.contactId = l.contactId AND r.kind = 'importacao' AND r.status = 'feita' AND ${cond}
      AND NOT EXISTS (SELECT 1 FROM ConversationReadings r2 JOIN Tickets rt2 ON rt2.id = r2.ticketId WHERE rt2.contactId = l.contactId AND r2.kind = 'importacao' AND r2.status = 'feita' AND r2.doneAt > r.doneAt)`;
  const notLead = doneReading(`r.result LIKE '%"action":"nao_lead"%'`);
  const isLead = doneReading(`r.result NOT LIKE '%"action":"nao_lead"%' AND r.result NOT LIKE '%"action":"nada"%'`);
  // a contact with no name (only the number) is a lead here only when the AI read it as one
  const onlyNumber = (name: any) => /^[\s+()\d-]*$/.test(String(name || ""));
  // out of Parados (back to the funnel): still waiting for the reading, or the reading says it is not a lead, or only a number for a name
  // that the reading never confirmed as a lead (if the reading later says it is a stalled lead, it comes back here)
  const excluded = (r: any) => Number(r.waiting) === 1 || Number(r.notLead) === 1 || (onlyNumber(r.name) && Number(r.readAsLead) !== 1);
  const flags = `CASE WHEN EXISTS (${waitingReading}) THEN 1 ELSE 0 END AS waiting, CASE WHEN EXISTS (${notLead}) THEN 1 ELSE 0 END AS notLead,
      CASE WHEN EXISTS (${isLead}) THEN 1 ELSE 0 END AS readAsLead`;
  const early = ((await sequelize.query(
    portable(`SELECT l.id, l.name, ${flags} FROM Leads l WHERE l.recoveryState = 'aberta' AND l.recoveryReason = :reason AND l.contactId IS NOT NULL LIMIT 5000`),
    { replacements: { reason: STALLED_REASON }, type: QueryTypes.SELECT }
  )) as any[]).filter(excluded).map(r => r.id);
  if (early.length) await Lead.update({ recoveryState: null, recoveryAt: null, recoveryReason: null } as any, { where: { id: early, recoveryState: "aberta" } as any });
  // only a real person in the funnel (never the team, a personal contact, a channel or a broadcast list: the same rule of LeadQueue),
  // filtered in the database before the limit, so every stalled lead is reached whatever the size of the funnel
  const rows = (await sequelize.query(
    portable(`SELECT x.id, x.name, x.waiting, x.notLead, x.readAsLead FROM (
        SELECT l.id, l.name, ${last} AS lastFromMe, ${lastAt} AS lastAt, ${flags} FROM Leads l JOIN LeadStages s ON s.id = l.stageId JOIN Contacts ct ON ct.id = l.contactId
        WHERE l.isHistorical = false AND l.enrolledAt IS NULL AND l.recoveryState IS NULL AND s.type = 'open' AND s.name <> :confirm
          AND ct.isStaff = false AND ct.isPersonal = false AND COALESCE(ct.kind, 'person') = 'person' AND COALESCE(ct.noReply, false) = false
      ) x WHERE x.lastFromMe = true AND x.lastAt <= :until AND x.lastAt >= :since LIMIT 5000`),
    { replacements: { confirm: CONFIRM_STAGE, until: new Date(now - days(stalledDays)), since: new Date(now - days(90)) }, type: QueryTypes.SELECT }
  )) as any[];
  const stalled = rows.filter(r => !excluded(r)).map(r => r.id);
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
  if (stalled.length || back.length || early.length) logger.info(`Recuperação: ${stalled.length} leads parados há ${stalledDays} dias ou mais; ${back.length} voltaram a responder; ${early.length} esperam a leitura`);
  return { marked: stalled.length, released: back.length + early.length };
};
