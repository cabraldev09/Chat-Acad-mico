import { QueryTypes } from "sequelize";

import sequelize from "../../database";
import { dayBounds, getAppTz, shiftDays, todayInAppTz } from "../../helpers/AppTime";
import { getSetting, setSetting } from "../../helpers/AppSettings";
import { portable } from "../../helpers/sqlDialect";
import { isManagerRole, roleOf } from "../../helpers/Roles";
import AppError from "../../errors/AppError";
import User from "../../models/User";
import PoloMember from "../../models/PoloMember";
import Polo from "../../models/Polo";
import { progressForUser } from "../../controllers/GoalController";
import { KPI_KEYS } from "./definitions";

// ONE place computes every indicator of a consultant. The management center and the consultant's own screen both call
// computeMetrics(), with the same period, so the same person, period and rules always give the same numbers.
// Nothing here is computed by the screens.

export type RangeKey = "today" | "week" | "month" | "custom";

export interface Period {
  range: RangeKey;
  start: Date;
  end: Date;
  from: string; // YYYY-MM-DD in the company timezone
  to: string;
}

const iso = (d: Date): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: getAppTz(), year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

// the same filters for every consumer: today, the last 7 days (today included), the month so far, or a chosen range
export const resolvePeriod = (query: { range?: any; from?: any; to?: any }): Period => {
  const range: RangeKey = ["today", "week", "month", "custom"].includes(String(query.range)) ? (String(query.range) as RangeKey) : "today";
  const today = todayInAppTz();
  const todayStart = dayBounds(today).start;
  let startDay = today;
  let endDay = today;
  if (range === "week") startDay = iso(shiftDays(todayStart, -6));
  else if (range === "month") startDay = `${today.slice(0, 8)}01`;
  else if (range === "custom") {
    const f = /^\d{4}-\d{2}-\d{2}$/.test(String(query.from || "")) ? String(query.from) : today;
    const t = /^\d{4}-\d{2}-\d{2}$/.test(String(query.to || "")) ? String(query.to) : f;
    startDay = f <= t ? f : t;
    endDay = f <= t ? t : f;
    if ((dayBounds(endDay).start.getTime() - dayBounds(startDay).start.getTime()) / 86400000 > 366) throw new AppError("ERR_PERIOD_TOO_LONG", 400);
  }
  return { range, start: dayBounds(startDay).start, end: dayBounds(endDay).end, from: startDay, to: endDay };
};

const rows = async (sql: string, replacements: Record<string, any>): Promise<any[]> =>
  (await sequelize.query(portable(sql), { replacements, type: QueryTypes.SELECT })) as any[];

// Customers only: no groups, copied history, team members' chats or personal contacts
const VALID_TICKET = `t.isHistorical = false AND t.isGroup = false AND NOT EXISTS (SELECT 1 FROM Contacts sc WHERE sc.id = t.contactId AND (sc.isStaff = true OR sc.isPersonal = true OR sc.kind <> 'person'))`;

// ---------------------------------------------------------------- configuration (schedules, targets, rules)
export interface AnalyticsConfig {
  // minutes without any activity after which someone on schedule is shown as idle
  activeWindowMinutes: number;
  dailyMessagesTarget: number;
  dailyAttendancesTarget: number;
  // userId -> weekday ("0" Sunday … "6") -> [{ start: "08:00", end: "18:00" }]
  schedules: Record<string, Record<string, Array<{ start: string; end: string }>>>;
}

const DEFAULT_CONFIG: AnalyticsConfig = { activeWindowMinutes: 15, dailyMessagesTarget: 0, dailyAttendancesTarget: 0, schedules: {} };

export const getConfig = async (): Promise<AnalyticsConfig> => {
  try {
    const parsed = JSON.parse(await getSetting("analytics_config", "{}"));
    return { ...DEFAULT_CONFIG, ...parsed, schedules: parsed.schedules || {} };
  } catch (_) {
    return { ...DEFAULT_CONFIG };
  }
};

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
export const saveConfig = async (input: any): Promise<AnalyticsConfig> => {
  const cfg: AnalyticsConfig = { ...DEFAULT_CONFIG };
  cfg.activeWindowMinutes = Math.min(240, Math.max(1, Number(input?.activeWindowMinutes) || DEFAULT_CONFIG.activeWindowMinutes));
  cfg.dailyMessagesTarget = Math.min(5000, Math.max(0, Math.floor(Number(input?.dailyMessagesTarget) || 0)));
  cfg.dailyAttendancesTarget = Math.min(1000, Math.max(0, Math.floor(Number(input?.dailyAttendancesTarget) || 0)));
  const schedules: AnalyticsConfig["schedules"] = {};
  for (const [uid, days] of Object.entries(input?.schedules || {})) {
    if (!/^\d+$/.test(uid) || typeof days !== "object" || !days) continue;
    for (const [dow, slots] of Object.entries(days as Record<string, any>)) {
      if (!/^[0-6]$/.test(dow) || !Array.isArray(slots)) continue;
      const ok = slots.filter((s: any) => s && HHMM.test(String(s.start)) && HHMM.test(String(s.end)) && String(s.start) < String(s.end)).slice(0, 4).map((s: any) => ({ start: String(s.start), end: String(s.end) }));
      if (ok.length) (schedules[uid] = schedules[uid] || {})[dow] = ok;
    }
  }
  cfg.schedules = schedules;
  await setSetting("analytics_config", JSON.stringify(cfg));
  return cfg;
};

const nowInTz = (now: Date): { dow: string; hhmm: string } => {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: getAppTz(), weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(now);
  const get = (t: string) => parts.find(p => p.type === t)?.value || "";
  const dow = String({ Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[get("weekday") as "Sun"] ?? 0);
  return { dow, hhmm: `${get("hour") === "24" ? "00" : get("hour")}:${get("minute")}` };
};

// ---------------------------------------------------------------- who counts as a consultant, and who may see whom
export const consultantWhere = `u.profile <> 'admin' AND (u.role = 'consultor' OR u.role IS NULL OR u.role = '')`;

// Consultants the requester may see: administration sees all; coordination sees the consultants of its polos (all, when it has no polo yet).
// A consultant sees nobody here: their own numbers come from /analytics/me.
export const visibleConsultantIds = async (user: any): Promise<number[]> => {
  if (!isManagerRole(roleOf(user))) return [];
  const all = (await rows(`SELECT u.id FROM Users u WHERE ${consultantWhere} ORDER BY u.name`, {})).map(r => Number(r.id));
  if (user.profile === "admin" || roleOf(user) === "admin") return all;
  const mine = (await PoloMember.findAll({ where: { userId: Number(user.id) }, attributes: ["poloId"] })).map(m => m.poloId);
  if (!mine.length) return all;
  const inPolos = (await PoloMember.findAll({ where: { poloId: mine }, attributes: ["userId"] })).map(m => m.userId);
  const allowed = new Set(inPolos);
  return all.filter(id => allowed.has(id));
};

export const canSeeConsultant = async (user: any, targetId: number): Promise<boolean> =>
  Number(user.id) === targetId || (await visibleConsultantIds(user)).includes(targetId);

// ---------------------------------------------------------------- the metrics
export interface Metrics {
  userId: number;
  messagesSent: number;
  attendances: number;
  reactivated: number;
  leadsWorked: number;
  pendingReply: number;
  inProgress: number;
  tasksOpen: number;
  tasksOverdue: number;
  tasksDone: number;
  followUpsDue: number;
  proposalsSent: number;
  proposalsViewed: number;
  enrollments: number;
  conversion: number | null;
}

const blank = (userId: number): Metrics => ({
  userId, messagesSent: 0, attendances: 0, reactivated: 0, leadsWorked: 0, pendingReply: 0, inProgress: 0, tasksOpen: 0, tasksOverdue: 0,
  tasksDone: 0, followUpsDue: 0, proposalsSent: 0, proposalsViewed: 0, enrollments: 0, conversion: null
});

export const computeMetrics = async (userIds: number[], period: Period, now: Date = new Date()): Promise<Map<number, Metrics>> => {
  const out = new Map<number, Metrics>(userIds.map(id => [id, blank(id)]));
  if (!userIds.length) return out;
  const rep = { ids: userIds, from: period.start, to: period.end, now, endOfToday: dayBounds(todayInAppTz()).end };
  const set = (r: any, key: keyof Metrics) => { const m = out.get(Number(r.userId)); if (m) (m[key] as number) = Number(r.n || 0); };

  // human messages: one row per send, by who sent it (the outbox is the only place with the real author; robots never go through it)
  const sends = `FROM OutboundMessages o JOIN Tickets t ON t.id = o.ticketId WHERE o.status = 'sent' AND o.userId IN (:ids) AND o.sentAt BETWEEN :from AND :to AND ${VALID_TICKET}`;
  (await rows(`SELECT o.userId, COUNT(*) AS n ${sends} GROUP BY o.userId`, rep)).forEach(r => set(r, "messagesSent"));
  (await rows(`SELECT o.userId, COUNT(DISTINCT o.ticketId) AS n ${sends} GROUP BY o.userId`, rep)).forEach(r => set(r, "attendances"));
  (await rows(
    `SELECT o.userId, COUNT(DISTINCT o.ticketId) AS n ${sends} AND NOT EXISTS (SELECT 1 FROM Messages m WHERE m.ticketId = o.ticketId AND m.createdAt < o.sentAt AND m.createdAt >= o.sentAt - INTERVAL '7 days') GROUP BY o.userId`,
    rep
  )).forEach(r => set(r, "reactivated"));

  // leads worked: a real activity of the person on the lead, or a message of the person in the lead's conversation
  const worked = await rows(
    `SELECT DISTINCT a.userId, a.leadId FROM LeadActivities a WHERE a.userId IN (:ids) AND a.createdAt BETWEEN :from AND :to AND a.type NOT IN ('system', 'reopened')
     UNION SELECT DISTINCT o.userId, t.leadId FROM OutboundMessages o JOIN Tickets t ON t.id = o.ticketId WHERE o.status = 'sent' AND o.userId IN (:ids) AND o.sentAt BETWEEN :from AND :to AND t.leadId IS NOT NULL AND ${VALID_TICKET}`,
    rep
  );
  worked.forEach(r => { const m = out.get(Number(r.userId)); if (m) m.leadsWorked += 1; });

  // the situation right now
  (await rows(`SELECT t.userId, COUNT(*) AS n FROM Tickets t WHERE t.userId IN (:ids) AND t.status = 'open' AND ${VALID_TICKET} GROUP BY t.userId`, rep)).forEach(r => set(r, "inProgress"));
  (await rows(`SELECT t.userId, COUNT(*) AS n FROM Tickets t WHERE t.userId IN (:ids) AND t.status = 'open' AND t.lastMessageFromMe = false AND ${VALID_TICKET} GROUP BY t.userId`, rep)).forEach(r => set(r, "pendingReply"));

  // tasks and follow-ups
  (await rows(`SELECT userId, COUNT(*) AS n FROM LeadTasks WHERE userId IN (:ids) AND doneAt IS NULL GROUP BY userId`, rep)).forEach(r => set(r, "tasksOpen"));
  (await rows(`SELECT userId, COUNT(*) AS n FROM LeadTasks WHERE userId IN (:ids) AND doneAt IS NULL AND dueAt < :now GROUP BY userId`, rep)).forEach(r => set(r, "tasksOverdue"));
  (await rows(`SELECT userId, COUNT(*) AS n FROM LeadTasks WHERE userId IN (:ids) AND doneAt BETWEEN :from AND :to GROUP BY userId`, rep)).forEach(r => set(r, "tasksDone"));
  (await rows(
    `SELECT l.ownerId AS userId, COUNT(*) AS n FROM Leads l JOIN LeadStages s ON s.id = l.stageId WHERE l.ownerId IN (:ids) AND s.type = 'open' AND l.nextFollowUpAt IS NOT NULL AND l.nextFollowUpAt <= :endOfToday GROUP BY l.ownerId`,
    rep
  )).forEach(r => set(r, "followUpsDue"));

  // proposals and enrollments (the same wonAt rule as the goals)
  (await rows(`SELECT createdBy AS userId, COUNT(*) AS n FROM Proposals WHERE createdBy IN (:ids) AND sentAt BETWEEN :from AND :to GROUP BY createdBy`, rep)).forEach(r => set(r, "proposalsSent"));
  (await rows(`SELECT createdBy AS userId, COUNT(*) AS n FROM Proposals WHERE createdBy IN (:ids) AND viewedAt BETWEEN :from AND :to GROUP BY createdBy`, rep)).forEach(r => set(r, "proposalsViewed"));
  (await rows(`SELECT ownerId AS userId, COUNT(*) AS n FROM Leads WHERE ownerId IN (:ids) AND wonAt BETWEEN :from AND :to AND isHistorical = false GROUP BY ownerId`, rep)).forEach(r => set(r, "enrollments"));

  out.forEach(m => { m.conversion = m.leadsWorked > 0 ? Math.round((m.enrollments / m.leadsWorked) * 1000) / 10 : null; });
  return out;
};

// ---------------------------------------------------------------- history (per day, same rules)
export const computeSeries = async (userIds: number[], period: Period): Promise<Map<number, Array<{ day: string; messagesSent: number; attendances: number; enrollments: number }>>> => {
  const out = new Map<number, Array<{ day: string; messagesSent: number; attendances: number; enrollments: number }>>();
  if (!userIds.length) return out;
  const tz = getAppTz();
  const rep = { ids: userIds, from: period.start, to: period.end, tz };
  const dayOf = (col: string) => `to_char(${col} AT TIME ZONE :tz, 'YYYY-MM-DD')`;
  const sent = await rows(
    `SELECT o.userId, ${dayOf("o.sentAt")} AS day, COUNT(*) AS m, COUNT(DISTINCT o.ticketId) AS a FROM OutboundMessages o JOIN Tickets t ON t.id = o.ticketId
     WHERE o.status = 'sent' AND o.userId IN (:ids) AND o.sentAt BETWEEN :from AND :to AND ${VALID_TICKET} GROUP BY o.userId, day`,
    rep
  );
  const won = await rows(`SELECT ownerId AS userId, ${dayOf("wonAt")} AS day, COUNT(*) AS n FROM Leads WHERE ownerId IN (:ids) AND wonAt BETWEEN :from AND :to AND isHistorical = false GROUP BY ownerId, day`, rep);
  const days: string[] = [];
  for (let d = dayBounds(period.from).start; d.getTime() <= period.end.getTime(); d = shiftDays(d, 1)) days.push(iso(d));
  for (const id of userIds) {
    out.set(id, days.map(day => ({
      day,
      messagesSent: Number(sent.find(r => Number(r.userId) === id && r.day === day)?.m || 0),
      attendances: Number(sent.find(r => Number(r.userId) === id && r.day === day)?.a || 0),
      enrollments: Number(won.find(r => Number(r.userId) === id && r.day === day)?.n || 0)
    })));
  }
  return out;
};

// ---------------------------------------------------------------- presence and schedule (what the person did, not only what was planned)
export interface Presence {
  state: "active" | "idle" | "off";
  onSchedule: boolean;
  lastActivityAt: string | null;
  scheduleToday: Array<{ start: string; end: string }>;
  // the number of the person: without it nothing they type or receive goes through, so "no activity" has a real reason
  whatsapp: { state: "connected" | "offline" | "none"; name: string | null; since: string | null };
  // using the system right now (a request in the last 5 minutes) and the last time it was used
  online: boolean;
  lastSeenAt: string | null;
}

export const computePresence = async (userIds: number[], config: AnalyticsConfig, now: Date = new Date()): Promise<Map<number, Presence>> => {
  const out = new Map<number, Presence>();
  if (!userIds.length) return out;
  const last = await rows(
    `SELECT userId, MAX(at) AS at FROM (
       SELECT userId, sentAt AS at FROM OutboundMessages WHERE status = 'sent' AND userId IN (:ids) AND sentAt > :since
       UNION ALL SELECT userId, createdAt FROM LeadActivities WHERE userId IN (:ids) AND createdAt > :since AND type NOT IN ('system', 'reopened')
       UNION ALL SELECT userId, doneAt FROM LeadTasks WHERE userId IN (:ids) AND doneAt > :since
     ) x GROUP BY userId`,
    { ids: userIds, since: new Date(now.getTime() - 3 * 86400000) }
  );
  const numbers = await rows(`SELECT ownerId, name, status, statusSince FROM Whatsapps WHERE channel = 'whatsapp' AND ownerId IN (:ids)`, { ids: userIds });
  const whatsappOf = (id: number): Presence["whatsapp"] => {
    const mine = numbers.filter(n => Number(n.ownerId) === id);
    if (!mine.length) return { state: "none", name: null, since: null };
    const up = mine.find(n => n.status === "CONNECTED");
    const n = up || mine[0];
    return { state: up ? "connected" : "offline", name: n.name, since: n.statusSince ? new Date(n.statusSince).toISOString() : null };
  };
  const seenRows = await rows(`SELECT id, lastSeenAt FROM Users WHERE id IN (:ids)`, { ids: userIds });
  const { dow, hhmm } = nowInTz(now);
  for (const id of userIds) {
    const seenRaw = seenRows.find(r => Number(r.id) === id)?.lastSeenAt;
    const seenAt = seenRaw ? new Date(seenRaw) : null;
    const slots = config.schedules[String(id)]?.[dow] || [];
    const onSchedule = slots.some(s => s.start <= hhmm && hhmm < s.end);
    const at = last.find(r => Number(r.userId) === id)?.at;
    const lastAt = at ? new Date(at) : null;
    const recent = !!lastAt && now.getTime() - lastAt.getTime() <= config.activeWindowMinutes * 60000;
    out.set(id, { state: recent ? "active" : onSchedule ? "idle" : "off", onSchedule, lastActivityAt: lastAt ? lastAt.toISOString() : null, scheduleToday: slots, whatsapp: whatsappOf(id), online: !!seenAt && now.getTime() - seenAt.getTime() <= 5 * 60000, lastSeenAt: seenAt ? seenAt.toISOString() : null });
  }
  return out;
};

// ---------------------------------------------------------------- one bundle per person (identical for the manager and for the person)
export interface ConsultantBundle {
  user: { id: number; name: string };
  metrics: Metrics;
  presence: Presence;
  goals: any[];
  series: Array<{ day: string; messagesSent: number; attendances: number; enrollments: number }>;
}

export const bundlesFor = async (userIds: number[], period: Period, opts: { goals?: boolean } = {}): Promise<ConsultantBundle[]> => {
  if (!userIds.length) return [];
  const now = new Date();
  const config = await getConfig();
  const [metrics, series, presence, users] = await Promise.all([
    computeMetrics(userIds, period, now),
    computeSeries(userIds, period),
    computePresence(userIds, config, now),
    User.findAll({ where: { id: userIds }, attributes: ["id", "name"] })
  ]);
  const goals = opts.goals === false ? new Map<number, any[]>() : new Map<number, any[]>(await Promise.all(userIds.map(async id => [id, await progressForUser(id).catch(() => [])] as [number, any[]])));
  return userIds.map(id => ({
    user: { id, name: users.find(u => u.id === id)?.name || `#${id}` },
    metrics: metrics.get(id) as Metrics,
    presence: presence.get(id) as Presence,
    goals: goals.get(id) || [],
    series: series.get(id) || []
  }));
};

// ---------------------------------------------------------------- manager views: totals, polos and alerts, all derived from the bundles
const SUM_KEYS = KPI_KEYS.filter(k => k !== "conversion");

export const totalsOf = (bundles: ConsultantBundle[]): Record<string, number | null> => {
  const total: Record<string, number | null> = {};
  SUM_KEYS.forEach(k => { total[k] = bundles.reduce((s, b) => s + Number((b.metrics as any)[k] || 0), 0); });
  total.conversion = (total.leadsWorked as number) > 0 ? Math.round(((total.enrollments as number) / (total.leadsWorked as number)) * 1000) / 10 : null;
  return total;
};

export const byPolo = async (bundles: ConsultantBundle[]): Promise<Array<{ poloId: number; name: string; consultants: number; totals: Record<string, number | null> }>> => {
  if (!bundles.length) return [];
  const members = await PoloMember.findAll({ where: { userId: bundles.map(b => b.user.id) }, attributes: ["poloId", "userId"] });
  const polos = await Polo.findAll({ where: { id: [...new Set(members.map(m => m.poloId))] }, attributes: ["id", "name"] });
  return polos.map(p => {
    const ids = new Set(members.filter(m => m.poloId === p.id).map(m => m.userId));
    const list = bundles.filter(b => ids.has(b.user.id));
    return { poloId: p.id, name: p.name, consultants: list.length, totals: totalsOf(list) };
  });
};

export interface Alert { level: "high" | "medium" | "low"; userId: number; name: string; code: string; text: string; link: string }

export const alertsOf = (bundles: ConsultantBundle[], config: AnalyticsConfig): Alert[] => {
  const alerts: Alert[] = [];
  for (const b of bundles) {
    const { metrics: m, presence: p, user } = b;
    // the real cause first: no connected number means nothing reaches the person, whatever the other numbers say
    const noNumber = p.whatsapp.state !== "connected";
    if (p.whatsapp.state === "none") {
      // one honest line (the late tasks and waiting conversations of someone who cannot work are a consequence, not their activity)
      const stuck = m.tasksOverdue > 0 ? ` · ${m.tasksOverdue} tarefa(s) paradas com ele` : "";
      alerts.push({ level: "high", userId: user.id, name: user.name, code: "whatsapp_none", text: `ainda não conectou o WhatsApp: não recebe nem envia mensagens${stuck}`, link: "/connections" });
      continue;
    }
    if (p.whatsapp.state === "offline") alerts.push({ level: "high", userId: user.id, name: user.name, code: "whatsapp_offline", text: `WhatsApp desconectado${p.whatsapp.since ? ` desde ${new Date(p.whatsapp.since).toLocaleString("pt-BR", { timeZone: getAppTz(), day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}` : ""}: as mensagens não chegam`, link: "/connections" });
    if (m.tasksOverdue > 0) alerts.push({ level: m.tasksOverdue >= 5 ? "high" : "medium", userId: user.id, name: user.name, code: "tasks_overdue", text: `${m.tasksOverdue} tarefa(s) atrasada(s)`, link: `/crm/tarefas?scope=all` });
    if (m.pendingReply >= 5) alerts.push({ level: "high", userId: user.id, name: user.name, code: "pending_reply", text: `${m.pendingReply} conversas esperando resposta`, link: `/tickets` });
    if (!noNumber && p.onSchedule && p.state === "idle") alerts.push({ level: "medium", userId: user.id, name: user.name, code: "idle_on_schedule", text: `No horário de trabalho, sem atividade há mais de ${config.activeWindowMinutes} min`, link: `/gestao-comercial` });
    if (!noNumber && config.dailyMessagesTarget > 0 && m.messagesSent < config.dailyMessagesTarget && p.onSchedule) alerts.push({ level: "low", userId: user.id, name: user.name, code: "below_messages_target", text: `${m.messagesSent} de ${config.dailyMessagesTarget} mensagens da meta diária`, link: `/gestao-comercial` });
    if (m.followUpsDue >= 5) alerts.push({ level: "medium", userId: user.id, name: user.name, code: "followups_due", text: `${m.followUpsDue} follow-ups para hoje`, link: `/crm/painel` });
    if (m.leadsWorked >= 10 && m.enrollments === 0) alerts.push({ level: "low", userId: user.id, name: user.name, code: "no_conversion", text: `${m.leadsWorked} leads trabalhados e nenhuma matrícula no período`, link: `/crm/painel` });
  }
  const order = { high: 0, medium: 1, low: 2 } as const;
  return alerts.sort((a, b) => order[a.level] - order[b.level]);
};
