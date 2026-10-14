import { Request, Response } from "express";
import { QueryTypes } from "sequelize";

import sequelize from "../database";
import UserQueue from "../models/UserQueue";
import { dayBounds, fmtDate, getAppTz, shiftDays } from "../helpers/AppTime";
import { roleOf } from "../helpers/Roles";
import { portable, diffSeconds, nowSql } from "../helpers/sqlDialect";

const q = async (sql: string, replacements: Record<string, any>): Promise<any[]> =>
  (await sequelize.query(portable(sql), { replacements, type: QueryTypes.SELECT })) as any[];

// Home screen. Two separate things, never mixed:
//  - "agora": what is on the table right now (open, waiting, unread, who needs attention)
//  - "dia": what happened on the chosen day (conversations, messages, finished, first response, by hour, last 7 days)
// Groups, copied history and people of the team are not customers: they are out of every number here.
// An administrator sees everyone; anyone else sees their own conversations and the unassigned ones of their queues.
export const index = async (req: Request, res: Response): Promise<Response> => {
  const day = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.date || "")) ? String(req.query.date) : undefined;
  const { start, end } = dayBounds(day);
  const weekStart = dayBounds(shiftDays(start, -6)).start;
  const me = Number(req.user.id);
  const admin = roleOf(req.user) === "admin";
  const queueIds = admin ? [] : (await UserQueue.findAll({ where: { userId: me } })).map(u => u.queueId);

  const base = `t.isHistorical = false AND t.isGroup = false AND NOT EXISTS (SELECT 1 FROM Contacts sc WHERE sc.id = t.contactId AND sc.isStaff = true)`;
  const scope = admin
    ? ""
    : `AND (t.userId = :me OR (t.userId IS NULL AND (t.queueId IS NULL OR t.queueId IN (:queueIds))))`;
  const rep = { from: start, to: end, weekStart, me, queueIds: queueIds.length ? queueIds : [0] };
  const live = `${base} ${scope} AND t.archivedAt IS NULL`;
  const tz = getAppTz();

  const [counts] = await q(
    `SELECT
       SUM(CASE WHEN t.status = 'open' THEN 1 ELSE 0 END) AS open,
       SUM(CASE WHEN t.status = 'pending' THEN 1 ELSE 0 END) AS pending,
       SUM(CASE WHEN t.status IN ('open','pending') AND t.unreadMessages > 0 THEN 1 ELSE 0 END) AS unread
     FROM Tickets t WHERE t.status IN ('open','pending') AND ${live}`,
    rep
  );

  const idle = diffSeconds("COALESCE(t.lastMessageAt, t.updatedAt)", nowSql());
  const waiting = await q(
    `SELECT t.id, c.name, ${idle} AS seconds
     FROM Tickets t JOIN Contacts c ON c.id = t.contactId
     WHERE t.status = 'pending' AND ${live}
     ORDER BY COALESCE(t.lastMessageAt, t.updatedAt) ASC LIMIT 5`,
    rep
  );
  // open conversations where the customer spoke last and nobody answered for a while
  const unanswered = await q(
    `SELECT t.id, c.name, ${idle} AS seconds
     FROM Tickets t JOIN Contacts c ON c.id = t.contactId
     WHERE t.status = 'open' AND t.lastMessageFromMe = false AND t.lastMessageId IS NOT NULL
       AND ${idle} > 900 AND ${live}
     ORDER BY COALESCE(t.lastMessageAt, t.updatedAt) ASC LIMIT 5`,
    rep
  );

  // the chosen day: messages of live conversations written inside that civil day (company timezone)
  const [msgs] = await q(
    `SELECT COUNT(DISTINCT m.ticketId) AS conversations,
            SUM(CASE WHEN m.fromMe = false THEN 1 ELSE 0 END) AS received,
            SUM(CASE WHEN m.fromMe = true THEN 1 ELSE 0 END) AS sent
     FROM Messages m JOIN Tickets t ON t.id = m.ticketId
     WHERE m.createdAt BETWEEN :from AND :to AND m.isDeleted = false AND ${base} ${scope}`,
    rep
  );
  const hours = await q(
    `SELECT EXTRACT(HOUR FROM (m.createdAt AT TIME ZONE '${tz}')) AS hour, m.fromMe AS mine, COUNT(*) AS n
     FROM Messages m JOIN Tickets t ON t.id = m.ticketId
     WHERE m.createdAt BETWEEN :from AND :to AND m.isDeleted = false AND ${base} ${scope}
     GROUP BY 1, 2`,
    rep
  );
  const [closed] = await q(
    `SELECT COUNT(*) AS n FROM Tickets t WHERE t.closedAt BETWEEN :from AND :to AND ${base} ${scope}`,
    rep
  );
  const [response] = await q(
    `SELECT AVG(${diffSeconds("t.createdAt", "t.firstResponseAt")}) AS avg, COUNT(*) AS n
     FROM Tickets t
     WHERE t.firstResponseAt BETWEEN :from AND :to AND t.createdAt >= :weekStart AND ${base} ${scope}`,
    rep
  );
  const weekRows = await q(
    `SELECT TO_CHAR(m.createdAt AT TIME ZONE '${tz}', 'YYYY-MM-DD') AS day, COUNT(DISTINCT m.ticketId) AS conversations
     FROM Messages m JOIN Tickets t ON t.id = m.ticketId
     WHERE m.createdAt BETWEEN :weekStart AND :to AND m.isDeleted = false AND ${base} ${scope}
     GROUP BY 1`,
    rep
  );

  const byHour = Array.from({ length: 24 }, (_, h) => ({ hour: h, received: 0, sent: 0 }));
  hours.forEach(r => {
    const slot = byHour[Number(r.hour)];
    if (r.mine === true || r.mine === 1 || r.mine === "t") slot.sent += Number(r.n);
    else slot.received += Number(r.n);
  });
  // the chart shows the working window, widened when the day has activity outside it
  const active = byHour.filter(h => h.received + h.sent > 0).map(h => h.hour);
  const first = Math.min(7, ...(active.length ? active : [7]));
  const last = Math.max(19, ...(active.length ? active : [19]));

  const weekMap = new Map(weekRows.map(r => [String(r.day), Number(r.conversations)]));
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = fmtIso(shiftDays(start, i - 6));
    return { date: d, conversations: weekMap.get(d) || 0 };
  });

  return res.json({
    date: fmtIso(start),
    scope: admin ? "all" : "mine",
    now: {
      open: Number(counts?.open || 0),
      pending: Number(counts?.pending || 0),
      unread: Number(counts?.unread || 0),
      waiting: waiting.map(r => ({ id: r.id, name: r.name, seconds: Math.round(Number(r.seconds)) })),
      unanswered: unanswered.map(r => ({ id: r.id, name: r.name, seconds: Math.round(Number(r.seconds)) }))
    },
    day: {
      conversations: Number(msgs?.conversations || 0),
      received: Number(msgs?.received || 0),
      sent: Number(msgs?.sent || 0),
      closed: Number(closed?.n || 0),
      avgFirstResponse: response?.avg === null || response?.avg === undefined ? null : Math.round(Number(response.avg)),
      byHour: byHour.slice(first, last + 1),
      week,
      previousConversations: week[5].conversations
    },
    label: fmtDate(start)
  });
};

// YYYY-MM-DD of an instant in the company timezone
const fmtIso = (d: Date): string => {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: getAppTz(), year: "numeric", month: "2-digit", day: "2-digit" });
  return f.format(d);
};
