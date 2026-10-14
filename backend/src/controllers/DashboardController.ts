import { Request, Response } from "express";
import { QueryTypes } from "sequelize";

import sequelize from "../database";
import UserQueue from "../models/UserQueue";
import { dayBounds, fmtDate, getAppTz, shiftDays } from "../helpers/AppTime";
import { businessMinutes, getBusinessConfig } from "../helpers/BusinessTime";
import { roleOf } from "../helpers/Roles";
import { portable } from "../helpers/sqlDialect";

const q = async (sql: string, replacements: Record<string, any>): Promise<any[]> =>
  (await sequelize.query(portable(sql), { replacements, type: QueryTypes.SELECT })) as any[];

// YYYY-MM-DD of an instant in the company timezone
const fmtIso = (d: Date): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: getAppTz(), year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

const num = (v: any): number => Number(v || 0);

// Home screen. Two parts that never mix:
//  - "now": what is on the table right now (open, waiting, unread and who needs an answer)
//  - "period": what happened in the chosen day (or 7/30 days ending on it), counted PER ATTENDANCE (per lead)
// An attendance is a conversation where the customer wrote, or where someone of the team wrote and the conversation has
// an owner: bulk campaigns that nobody answered are not attendances. Groups, channels, copied history and people of the
// team are not customers and stay out of every number. An administrator sees everyone; anyone else sees their own
// conversations and the unassigned ones of their queues.
export const index = async (req: Request, res: Response): Promise<Response> => {
  const day = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.date || "")) ? String(req.query.date) : undefined;
  const rangeDays = [1, 7, 30].includes(Number(req.query.days)) ? Number(req.query.days) : 1;
  const endBounds = dayBounds(day);
  const start = dayBounds(shiftDays(endBounds.start, -(rangeDays - 1))).start;
  const end = endBounds.end;
  const prevEnd = new Date(start.getTime() - 1);
  const prevStart = dayBounds(shiftDays(start, -rangeDays)).start;
  const weekStart = dayBounds(shiftDays(endBounds.start, -6)).start;

  const me = Number(req.user.id);
  const role = roleOf(req.user);
  const admin = role === "admin";
  const queueIds = admin ? [] : (await UserQueue.findAll({ where: { userId: me } })).map(u => u.queueId);

  const base = `t.isHistorical = false AND t.isGroup = false AND NOT EXISTS (SELECT 1 FROM Contacts sc WHERE sc.id = t.contactId AND (sc.isStaff = true OR sc.kind <> 'person'))`;
  const scope = admin
    ? ""
    : `AND (t.userId = :me OR (t.userId IS NULL AND (t.queueId IS NULL OR t.queueId IN (:queueIds))))`;
  const rep = { from: start, to: end, weekStart, prevFrom: prevStart, prevTo: prevEnd, me, queueIds: queueIds.length ? queueIds : [0] };
  const live = `${base} ${scope} AND t.archivedAt IS NULL`;
  const tz = getAppTz();
  const business = await getBusinessConfig();

  // ---------------------------------------------------------------- now
  const [counts] = await q(
    `SELECT
       SUM(CASE WHEN t.status = 'open' THEN 1 ELSE 0 END) AS open,
       SUM(CASE WHEN t.status = 'pending' THEN 1 ELSE 0 END) AS pending,
       SUM(CASE WHEN t.status IN ('open','pending') AND t.unreadMessages > 0 THEN 1 ELSE 0 END) AS unread
     FROM Tickets t WHERE t.status IN ('open','pending') AND ${live}`,
    rep
  );
  const since = `COALESCE(t.lastMessageAt, t.updatedAt)`;
  const waitingRows = await q(
    `SELECT t.id, t.contactId, c.name, ${since} AS at
     FROM Tickets t JOIN Contacts c ON c.id = t.contactId
     WHERE t.status = 'pending' AND ${live}
     ORDER BY ${since} ASC LIMIT 6`,
    rep
  );
  // the customer spoke last, nobody answered, and it is not a notice: counted in working hours, last 24 hours only
  const candidates = await q(
    `SELECT t.id, t.contactId, c.name, ${since} AS at
     FROM Tickets t JOIN Contacts c ON c.id = t.contactId
     WHERE t.status = 'open' AND t.lastMessageFromMe = false AND t.lastMessageId IS NOT NULL
       AND COALESCE(t.lastMessageType, 'chat') <> 'reaction' AND c.noReply = false
       AND ${since} > ${`NOW() - INTERVAL '24 hours'`} AND ${live}
     ORDER BY ${since} ASC LIMIT 80`,
    rep
  );
  const nowDate = new Date();
  const unanswered = candidates
    .map(r => ({ id: r.id, contactId: r.contactId, name: r.name, seconds: Math.round(businessMinutes(business, new Date(r.at), nowDate) * 60) }))
    .filter(r => r.seconds >= 15 * 60)
    .sort((a, b) => b.seconds - a.seconds)
    .slice(0, 6);
  const waiting = waitingRows.map(r => ({ id: r.id, contactId: r.contactId, name: r.name, seconds: Math.round((nowDate.getTime() - new Date(r.at).getTime()) / 1000) }));

  // ---------------------------------------------------------------- period, per attendance
  const rows = await q(
    `SELECT t.id, c.name, t.status, t.userId, t.firstResponseAt, t.createdAt AS ticketCreatedAt,
            SUM(CASE WHEN m.fromMe = false THEN 1 ELSE 0 END) AS received,
            SUM(CASE WHEN m.fromMe = true THEN 1 ELSE 0 END) AS sent,
            MAX(m.createdAt) AS lastAt
     FROM Messages m JOIN Tickets t ON t.id = m.ticketId JOIN Contacts c ON c.id = t.contactId
     WHERE m.createdAt BETWEEN :from AND :to AND m.isDeleted = false AND ${base} ${scope}
     GROUP BY t.id, c.name, t.status, t.userId, t.firstResponseAt, t.createdAt
     HAVING SUM(CASE WHEN m.fromMe = false THEN 1 ELSE 0 END) > 0
         OR (SUM(CASE WHEN m.fromMe = true THEN 1 ELSE 0 END) > 0 AND t.userId IS NOT NULL)
     ORDER BY MAX(m.createdAt) DESC LIMIT 3000`,
    rep
  );
  const attendanceIds = rows.map(r => Number(r.id));
  const received = rows.reduce((t, r) => t + num(r.received), 0);
  const sent = rows.reduce((t, r) => t + num(r.sent), 0);
  const attendances = rows.length;

  const hourRows = attendanceIds.length
    ? await q(
        `SELECT EXTRACT(HOUR FROM (m.createdAt AT TIME ZONE '${tz}')) AS hour, m.fromMe AS mine, COUNT(*) AS n
         FROM Messages m
         WHERE m.createdAt BETWEEN :from AND :to AND m.isDeleted = false AND m.ticketId IN (:ids)
         GROUP BY 1, 2`,
        { ...rep, ids: attendanceIds }
      )
    : [];
  const byHour = Array.from({ length: 24 }, (_, h) => ({ hour: h, received: 0, sent: 0 }));
  hourRows.forEach(r => {
    const slot = byHour[Number(r.hour)];
    if (r.mine === true || r.mine === 1 || r.mine === "t") slot.sent += num(r.n);
    else slot.received += num(r.n);
  });
  const active = byHour.filter(h => h.received + h.sent > 0).map(h => h.hour);
  const first = Math.min(7, ...(active.length ? active : [7]));
  const last = Math.max(19, ...(active.length ? active : [19]));

  const [closed] = await q(`SELECT COUNT(*) AS n FROM Tickets t WHERE t.closedAt BETWEEN :from AND :to AND ${base} ${scope}`, rep);

  // time to the first answer, in working hours, of the attendances that started and were answered in the period
  const answered = rows.filter(r => r.firstResponseAt && new Date(r.firstResponseAt) >= start && new Date(r.firstResponseAt) <= end && new Date(r.ticketCreatedAt) >= weekStart);
  const avgFirstResponse = answered.length
    ? Math.round((answered.reduce((t, r) => t + businessMinutes(business, new Date(r.ticketCreatedAt), new Date(r.firstResponseAt)) * 60, 0)) / answered.length)
    : null;

  // enrolments of the period (a consultant sees their own)
  const leadScope = role === "consultor" ? "AND l.ownerId = :me" : "";
  const [enrolled] = await q(
    `SELECT COUNT(*) AS n FROM Leads l WHERE l.isHistorical = false AND l.wonAt BETWEEN :from AND :to ${leadScope}`,
    rep
  );

  // previous equal period, for the comparison
  const [prev] = await q(
    `SELECT COUNT(*) AS n FROM (
       SELECT t.id FROM Messages m JOIN Tickets t ON t.id = m.ticketId
       WHERE m.createdAt BETWEEN :prevFrom AND :prevTo AND m.isDeleted = false AND ${base} ${scope}
       GROUP BY t.id
       HAVING SUM(CASE WHEN m.fromMe = false THEN 1 ELSE 0 END) > 0
           OR (SUM(CASE WHEN m.fromMe = true THEN 1 ELSE 0 END) > 0 AND t.userId IS NOT NULL)
     ) x`,
    rep
  );

  // last 7 days (ending on the chosen day), attendances per day
  const weekRows = await q(
    `SELECT TO_CHAR(m.createdAt AT TIME ZONE '${tz}', 'YYYY-MM-DD') AS day, t.id,
            SUM(CASE WHEN m.fromMe = false THEN 1 ELSE 0 END) AS received,
            SUM(CASE WHEN m.fromMe = true THEN 1 ELSE 0 END) AS sent, t.userId
     FROM Messages m JOIN Tickets t ON t.id = m.ticketId
     WHERE m.createdAt BETWEEN :weekStart AND :to AND m.isDeleted = false AND ${base} ${scope}
     GROUP BY 1, t.id, t.userId`,
    rep
  );
  const perDay = new Map<string, number>();
  weekRows.forEach(r => {
    if (num(r.received) > 0 || (num(r.sent) > 0 && r.userId)) perDay.set(String(r.day), (perDay.get(String(r.day)) || 0) + 1);
  });
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = fmtIso(shiftDays(endBounds.start, i - 6));
    return { date: d, attendances: perDay.get(d) || 0 };
  });

  const table = rows.slice(0, 100).map(r => ({
    id: r.id,
    name: r.name,
    status: r.status,
    received: num(r.received),
    sent: num(r.sent),
    lastAt: r.lastAt,
    firstResponse:
      r.firstResponseAt && new Date(r.firstResponseAt) >= new Date(r.ticketCreatedAt)
        ? Math.round(businessMinutes(business, new Date(r.ticketCreatedAt), new Date(r.firstResponseAt)) * 60)
        : null
  }));

  return res.json({
    date: fmtIso(endBounds.start),
    rangeDays,
    scope: admin ? "all" : "mine",
    label: fmtDate(endBounds.start),
    now: {
      open: num(counts?.open),
      pending: num(counts?.pending),
      unread: num(counts?.unread),
      waiting,
      unanswered
    },
    period: {
      attendances,
      received,
      sent,
      avgReceived: attendances ? Math.round((received / attendances) * 10) / 10 : 0,
      avgSent: attendances ? Math.round((sent / attendances) * 10) / 10 : 0,
      closed: num(closed?.n),
      enrolled: num(enrolled?.n),
      avgFirstResponse,
      previousAttendances: num(prev?.n),
      byHour: byHour.slice(first, last + 1),
      week,
      table
    }
  });
};

