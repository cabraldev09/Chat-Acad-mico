import { Request, Response } from "express";
import { QueryTypes } from "sequelize";

import sequelize from "../database";
import { dayBounds, getAppTz, shiftDays } from "../helpers/AppTime";
import { getSetting } from "../helpers/AppSettings";
import { businessMinutes, getBusinessConfig } from "../helpers/BusinessTime";
import { isManagerRole, roleOf } from "../helpers/Roles";
import { remember } from "../helpers/TtlCache";
import { buildInsights, human, pairGaps, summarize } from "../helpers/ResponseTimes";
import { portable } from "../helpers/sqlDialect";
import { progressForUser } from "./GoalController";
import { summaryForUser } from "./CommissionController";

const q = async (sql: string, replacements: Record<string, any>): Promise<any[]> =>
  (await sequelize.query(portable(sql), { replacements, type: QueryTypes.SELECT })) as any[];

const num = (v: any): number => Number(v || 0);
const isTrue = (v: any): boolean => v === true || v === 1 || v === "t" || v === "true";

const DEPARTMENTS: Array<[string, string]> = [
  ["sales", "Comercial"],
  ["postsale", "Pós-venda"],
  ["onboarding", "Ambientação"],
  ["support", "Acadêmico"]
];

const BASE = `t.isHistorical = false AND t.isGroup = false AND NOT EXISTS (SELECT 1 FROM Contacts sc WHERE sc.id = t.contactId AND (sc.isStaff = true OR sc.kind <> 'person'))`;

const period = (req: Request) => {
  const day = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.date || "")) ? String(req.query.date) : undefined;
  const rangeDays = [1, 7, 30].includes(Number(req.query.days)) ? Number(req.query.days) : 1;
  const endBounds = dayBounds(day);
  const start = dayBounds(shiftDays(endBounds.start, -(rangeDays - 1))).start;
  const prevEnd = new Date(start.getTime() - 1);
  const prevStart = dayBounds(shiftDays(start, -rangeDays)).start;
  return { rangeDays, from: start, to: endBounds.end, prevFrom: prevStart, prevTo: prevEnd };
};

const hourOf = (d: Date, tz: string): number =>
  Number(new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", hourCycle: "h23" }).format(d));

const buildManagement = async (p: ReturnType<typeof period>): Promise<any> => {
  const rep = { from: p.from, to: p.to, prevFrom: p.prevFrom, prevTo: p.prevTo };
  const business = await getBusinessConfig();
  const sla = Math.min(1440, Math.max(1, Number(await getSetting("response_sla_minutes", "15")) || 15));

  const [attendances, msgs, prevMsgs, live, enrolledRows, users, polos] = await Promise.all([
    q(
      `SELECT t.id, COALESCE(t.segment, 'sales') AS segment, t.userId, qu.poloId, t.firstResponseAt, t.createdAt AS ticketCreatedAt,
              SUM(CASE WHEN m.fromMe = false THEN 1 ELSE 0 END) AS received, SUM(CASE WHEN m.fromMe = true THEN 1 ELSE 0 END) AS sent
       FROM Messages m JOIN Tickets t ON t.id = m.ticketId LEFT JOIN Queues qu ON qu.id = t.queueId
       WHERE m.createdAt BETWEEN :from AND :to AND m.isDeleted = false AND ${BASE}
       GROUP BY t.id, t.segment, t.userId, qu.poloId, t.firstResponseAt, t.createdAt
       HAVING SUM(CASE WHEN m.fromMe = false THEN 1 ELSE 0 END) > 0 OR (SUM(CASE WHEN m.fromMe = true THEN 1 ELSE 0 END) > 0 AND t.userId IS NOT NULL)
       LIMIT 6000`,
      rep
    ),
    q(`SELECT m.ticketId, m.fromMe, m.createdAt FROM Messages m JOIN Tickets t ON t.id = m.ticketId WHERE m.createdAt BETWEEN :from AND :to AND m.isDeleted = false AND ${BASE} ORDER BY m.ticketId, m.createdAt LIMIT 60000`, rep),
    q(`SELECT m.ticketId, m.fromMe, m.createdAt FROM Messages m JOIN Tickets t ON t.id = m.ticketId WHERE m.createdAt BETWEEN :prevFrom AND :prevTo AND m.isDeleted = false AND ${BASE} ORDER BY m.ticketId, m.createdAt LIMIT 60000`, rep),
    q(
      `SELECT t.id, COALESCE(t.segment, 'sales') AS segment, t.userId, qu.poloId, t.status, t.lastMessageFromMe, t.lastMessageId, t.lastMessageType, COALESCE(t.lastMessageAt, t.updatedAt) AS at, c.noReply, c.name
       FROM Tickets t JOIN Contacts c ON c.id = t.contactId LEFT JOIN Queues qu ON qu.id = t.queueId
       WHERE t.status IN ('open', 'pending') AND t.archivedAt IS NULL AND ${BASE}`,
      rep
    ),
    q(`SELECT l.ownerId, l.poloId, COUNT(*) AS n FROM Leads l WHERE l.isHistorical = false AND l.wonAt BETWEEN :from AND :to GROUP BY l.ownerId, l.poloId`, rep),
    q(`SELECT id, name, role, profile FROM Users`, {}),
    q(`SELECT id, name FROM Polos`, {})
  ]);

  const meta = new Map<number, any>();
  attendances.forEach(a => meta.set(Number(a.id), a));
  const gaps = pairGaps(msgs as any, business);
  const prevGaps = pairGaps(prevMsgs as any, business);
  const now = new Date();

  // who is waiting for an answer right now (customer spoke last, open, a person, in the last 24 h, past the target)
  const waitingNow = live.filter(t => t.status === "pending");
  const unansweredNow = live.filter(
    t =>
      t.status === "open" && !isTrue(t.lastMessageFromMe) && t.lastMessageId && (t.lastMessageType || "chat") !== "reaction" && !isTrue(t.noReply) &&
      now.getTime() - new Date(t.at).getTime() < 24 * 3600 * 1000 &&
      businessMinutes(business, new Date(t.at), now) >= sla
  );

  const slice = (filter: (a: any) => boolean) => {
    const rowsIn = attendances.filter(filter);
    const ids = new Set(rowsIn.map(r => Number(r.id)));
    const g = gaps.filter(x => ids.has(x.ticketId));
    const answered = rowsIn.filter(r => r.firstResponseAt && new Date(r.firstResponseAt) >= p.from && new Date(r.firstResponseAt) <= p.to && new Date(r.firstResponseAt) >= new Date(r.ticketCreatedAt));
    return {
      attendances: rowsIn.length,
      received: rowsIn.reduce((t, r) => t + num(r.received), 0),
      sent: rowsIn.reduce((t, r) => t + num(r.sent), 0),
      reply: summarize(g.map(x => x.minutes), sla),
      firstResponse: summarize(answered.map(r => businessMinutes(business, new Date(r.ticketCreatedAt), new Date(r.firstResponseAt))), sla)
    };
  };

  const enrolledBy = (f: (r: any) => boolean) => enrolledRows.filter(f).reduce((t, r) => t + num(r.n), 0);

  const departments = DEPARTMENTS.map(([k, label]) => {
    const inSeg = (t: any) => t.segment === k;
    return {
      key: k,
      label,
      ...slice(inSeg),
      openNow: live.filter(t => inSeg(t) && t.status === "open").length,
      waitingNow: waitingNow.filter(inSeg).length,
      unansweredNow: unansweredNow.filter(inSeg).length,
      enrolled: k === "sales" ? enrolledBy(() => true) : 0
    };
  }).filter(d => d.attendances || d.openNow || d.waitingNow || d.unansweredNow || d.enrolled);

  const attendants = users
    .map(u => {
      const id = Number(u.id);
      return {
        id,
        name: u.name,
        role: u.role,
        ...slice(a => Number(a.userId) === id),
        openNow: live.filter(t => Number(t.userId) === id && t.status === "open").length,
        unansweredNow: unansweredNow.filter(t => Number(t.userId) === id).length,
        enrolled: enrolledBy(r => Number(r.ownerId) === id)
      };
    })
    .filter(a => a.attendances || a.openNow || a.enrolled)
    .sort((a, b) => b.attendances - a.attendances);

  const poloList = polos
    .map(po => {
      const id = Number(po.id);
      return {
        id,
        name: po.name,
        ...slice(a => Number(a.poloId) === id),
        openNow: live.filter(t => Number(t.poloId) === id && t.status === "open").length,
        waitingNow: waitingNow.filter(t => Number(t.poloId) === id).length,
        unansweredNow: unansweredNow.filter(t => Number(t.poloId) === id).length,
        enrolled: enrolledBy(r => Number(r.poloId) === id)
      };
    })
    .filter(x => x.attendances || x.openNow || x.waitingNow || x.enrolled)
    .sort((a, b) => b.attendances - a.attendances);

  const total = {
    ...slice(() => true),
    enrolled: enrolledBy(() => true),
    openNow: live.filter(t => t.status === "open").length,
    waitingNow: waitingNow.length,
    unansweredNow: unansweredNow.length
  };
  const prevReply = summarize(prevGaps.map(g => g.minutes), sla);
  const tz = getAppTz();
  const hourBuckets = new Map<number, number[]>();
  gaps.forEach(g => {
    const h = hourOf(g.at, tz);
    if (!hourBuckets.has(h)) hourBuckets.set(h, []);
    hourBuckets.get(h)!.push(g.minutes);
  });
  const byHour = Array.from({ length: 24 }, (_, h) => {
    const s = summarize(hourBuckets.get(h) || [], sla);
    return { hour: h, median: s.median, count: s.count };
  });

  const insights = buildInsights({ reply: total.reply, previous: prevReply, slaMinutes: sla, byHour, unanswered: unansweredNow.length, waiting: waitingNow.length, rangeDays: p.rangeDays });
  // what only a manager can act on: who and where is behind
  const slowDept = departments.filter(d => d.reply.count >= 5 && d.reply.median !== null).sort((a, b) => (b.reply.median as number) - (a.reply.median as number))[0];
  if (slowDept && departments.length > 1 && total.reply.median !== null && (slowDept.reply.median as number) > Math.max(total.reply.median * 1.5, sla)) {
    insights.push({ tone: "warn", text: `${slowDept.label} é o departamento mais lento: mediana de ${human(slowDept.reply.median)} (o geral é ${human(total.reply.median)}).` });
  }
  const overloaded = attendants.filter(a => a.openNow >= 15).sort((a, b) => b.openNow - a.openNow)[0];
  if (overloaded) insights.push({ tone: "warn", text: `${overloaded.name} está com ${overloaded.openNow} conversas abertas. Considere redistribuir parte delas.` });
  const stuck = attendants.filter(a => a.unansweredNow >= 3).sort((a, b) => b.unansweredNow - a.unansweredNow)[0];
  if (stuck) insights.push({ tone: "warn", text: `${stuck.name} tem ${stuck.unansweredNow} clientes esperando resposta agora.` });

  return {
    rangeDays: p.rangeDays,
    slaMinutes: sla,
    total: { ...total, previousMedian: prevReply.median },
    byHour: byHour.filter(h => h.count > 0),
    departments,
    attendants,
    polos: poloList,
    insights
  };
};

// Management view: every department, every attendant and every polo side by side. Administration and coordination only.
export const management = async (req: Request, res: Response): Promise<Response> => {
  if (!isManagerRole(roleOf(req.user))) return res.status(403).json({ error: "ERR_NO_PERMISSION" });
  const p = period(req);
  const key = `dash-mgmt:${p.rangeDays}:${p.to.toISOString().slice(0, 10)}`;
  return res.json(await remember(key, Number(process.env.DASHBOARD_CACHE_MS ?? 10000), () => buildManagement(p)));
};

// "My day" for the person logged in: what needs an answer, what is due, how they are doing against the goal and the commissions
export const myDay = async (req: Request, res: Response): Promise<Response> => {
  const me = Number(req.user.id);
  const business = await getBusinessConfig();
  const sla = Math.min(1440, Math.max(1, Number(await getSetting("response_sla_minutes", "15")) || 15));
  const now = new Date();
  const today = dayBounds();
  const weekFrom = dayBounds(shiftDays(today.start, -6)).start;
  const monthFrom = new Date(now.getFullYear(), now.getMonth(), 1);

  const [live, tasks, msgs, goals, commissions] = await Promise.all([
    q(
      `SELECT t.id, c.name, COALESCE(t.lastMessageAt, t.updatedAt) AS at, t.lastMessageFromMe, t.lastMessageId, t.lastMessageType, c.noReply
       FROM Tickets t JOIN Contacts c ON c.id = t.contactId
       WHERE t.status = 'open' AND t.userId = :me AND t.archivedAt IS NULL AND ${BASE}`,
      { me }
    ),
    q(
      `SELECT lt.id, lt.title, lt.dueAt, lt.leadId, l.name AS lead FROM LeadTasks lt LEFT JOIN Leads l ON l.id = lt.leadId
       WHERE lt.userId = :me AND lt.doneAt IS NULL AND lt.dueAt <= :end ORDER BY lt.dueAt ASC LIMIT 8`,
      { me, end: today.end }
    ),
    q(
      `SELECT m.ticketId, m.fromMe, m.createdAt FROM Messages m JOIN Tickets t ON t.id = m.ticketId
       WHERE m.createdAt BETWEEN :from AND :to AND m.isDeleted = false AND t.userId = :me AND ${BASE} ORDER BY m.ticketId, m.createdAt LIMIT 20000`,
      { me, from: weekFrom, to: today.end }
    ),
    progressForUser(me),
    summaryForUser(me, monthFrom)
  ]);

  const toReply = live
    .filter(t => !isTrue(t.lastMessageFromMe) && t.lastMessageId && (t.lastMessageType || "chat") !== "reaction" && !isTrue(t.noReply))
    .map(t => ({ id: t.id, name: t.name, minutes: Math.round(businessMinutes(business, new Date(t.at), now)), wall: Math.round((now.getTime() - new Date(t.at).getTime()) / 60000) }))
    .sort((a, b) => b.minutes - a.minutes);
  const reply = summarize(pairGaps(msgs as any, business).map(g => g.minutes), sla);
  const overdue = tasks.filter(t => new Date(t.dueAt) < today.start).length;

  const insights: Array<{ tone: string; text: string }> = [];
  const late = toReply.filter(t => t.minutes >= sla);
  if (late.length) insights.push({ tone: "warn", text: `${late.length} cliente${late.length === 1 ? "" : "s"} esperando resposta há mais de ${sla} min. Comece por ${late[0].name}: ${human(late[0].minutes)}.` });
  else if (live.length) insights.push({ tone: "good", text: "Nenhum cliente seu está esperando além da meta. Bom trabalho." });
  if (overdue) insights.push({ tone: "warn", text: `${overdue} tarefa${overdue === 1 ? "" : "s"} atrasada${overdue === 1 ? "" : "s"}.` });
  goals.forEach(g => {
    const name = g.title ? ` ${g.title}` : "";
    if (g.mine.reached) insights.push({ tone: "good", text: `Você bateu a meta${name || " do período"}!` });
    else if (g.mine.missing) {
      insights.push({
        tone: g.mine.pace && g.mine.pace > 1 ? "warn" : "info",
        text: `Meta${name}: faltam ${g.mine.missing} matrícula${g.mine.missing === 1 ? "" : "s"} em ${g.daysLeft} dia${g.daysLeft === 1 ? "" : "s"}${g.mine.pace ? ` (${g.mine.pace} por dia)` : ""}.`
      });
    }
  });
  if (commissions.owed.total > 0) {
    insights.push({ tone: "info", text: `Você tem ${commissions.owed.total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} de comissão a receber. Informe seu Wallet ID em Comissões para receber direto.` });
  }
  if (reply.count >= 5 && reply.median !== null) {
    insights.push({ tone: reply.median <= sla ? "good" : "info", text: `Nos últimos 7 dias, o cliente típico esperou ${human(reply.median)} por uma resposta sua; ${reply.withinSlaPct}% no prazo.` });
  }

  return res.json({
    slaMinutes: sla,
    toReply: toReply.slice(0, 8),
    toReplyCount: toReply.length,
    tasks: tasks.map(t => ({ id: t.id, title: t.title, dueAt: t.dueAt, leadId: t.leadId, lead: t.lead, overdue: new Date(t.dueAt) < today.start })),
    goals,
    commissions,
    reply,
    openNow: live.length,
    insights
  });
};
