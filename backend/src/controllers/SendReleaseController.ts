import { Request, Response } from "express";
import { Op, QueryTypes } from "sequelize";

import sequelize from "../database";
import AppError from "../errors/AppError";
import { getSetting } from "../helpers/AppSettings";
import { dayBounds, monthStartApp, todayInAppTz } from "../helpers/AppTime";
import { isManagerRole, roleOf } from "../helpers/Roles";
import Campaign from "../models/Campaign";
import SendRelease from "../models/SendRelease";
import User from "../models/User";
import { currentMonth, extraThisMonth, quotaOf, quotaSetting, usedThisMonth } from "../services/CampaignServices/SendQuota";
import { notify, notifyManagers } from "../services/NotificationServices/Notify";

// The quota of sends of the month and the requests for more (Estatísticas → Disparos): the person sees their quota and asks; the
// management sees the requests, approves (with how many) or denies, and follows what each person sent and spent.

const clean = (v: unknown, n: number): string => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);

export const myQuota = async (req: Request, res: Response): Promise<Response> => res.json(await quotaOf(Number(req.user.id), req.user as any));

export const requestRelease = async (req: Request, res: Response): Promise<Response> => {
  const userId = Number(req.user.id);
  if (isManagerRole(roleOf(req.user as any))) throw new AppError("ERR_SEND_RELEASE_MANAGER", 400);
  const requested = Math.floor(Number(req.body?.requested));
  if (!Number.isFinite(requested) || requested < 1 || requested > 5000) throw new AppError("ERR_SEND_RELEASE_AMOUNT", 400);
  const reason = clean(req.body?.reason, 500);
  if (reason.length < 5) throw new AppError("ERR_SEND_RELEASE_REASON", 400);
  const c = req.body?.context || {};
  const context = { type: c.type === "aviso" ? "aviso" : "campanha", name: clean(c.name, 160) || null, recipients: Number(c.recipients) > 0 ? Math.floor(Number(c.recipients)) : null };
  // one request waiting at a time (a second click does not pile up requests for the management)
  const row = await sequelize.transaction(async transaction => {
    if (sequelize.getDialect() === "postgres") await sequelize.query("SELECT pg_advisory_xact_lock(918274, :id)", { replacements: { id: userId }, transaction });
    if (await SendRelease.count({ where: { userId, status: "pending" }, transaction })) throw new AppError("ERR_SEND_RELEASE_PENDING", 409);
    return SendRelease.create({ userId, month: currentMonth(), requested, reason, context, status: "pending" } as any, { transaction });
  });
  const me = await User.findByPk(userId, { attributes: ["id", "name"] });
  await notifyManagers({
    kind: "send_release",
    level: "warning",
    title: `${clean(me?.name, 60) || "Uma pessoa"} pede liberação de ${requested} ${requested === 1 ? "mensagem" : "mensagens"}`,
    body: reason,
    link: "/estatisticas?aba=disparos",
    dedupeKey: `send_release:${row.id}`
  });
  return res.status(201).json(await quotaOf(userId, req.user as any));
};

const view = (r: SendRelease, used: Map<number, number>, extra: Map<number, number>, quota: number) => ({
  id: r.id, userId: r.userId, userName: (r as any).user?.name || null, month: r.month, requested: r.requested, reason: r.reason,
  context: r.context || null, status: r.status, granted: r.granted, decidedBy: (r as any).decider?.name || null, decidedAt: r.decidedAt,
  decisionNote: r.decisionNote, createdAt: r.createdAt,
  usage: { used: used.get(r.userId) || 0, quota, extra: extra.get(r.userId) || 0 }
});

export const listReleases = async (req: Request, res: Response): Promise<Response> => {
  const status = ["pending", "approved", "denied"].includes(String(req.query.status)) ? String(req.query.status) : null;
  const rows = await SendRelease.findAll({
    where: status ? { status } : {},
    include: [{ model: User, as: "user", attributes: ["id", "name"] }, { model: User, as: "decider", attributes: ["id", "name"] }],
    order: [["status", "DESC"], ["id", "DESC"]],
    limit: 200
  });
  const ids = [...new Set(rows.map(r => r.userId))];
  const [used, extra, quota, pending] = await Promise.all([usedThisMonth(ids), extraThisMonth(ids), quotaSetting(), SendRelease.count({ where: { status: "pending" } })]);
  return res.json({ pending, rows: rows.map(r => view(r, used, extra, quota)) });
};

export const decideRelease = async (req: Request, res: Response): Promise<Response> => {
  const action = req.body?.action === "approve" ? "approve" : req.body?.action === "deny" ? "deny" : null;
  if (!action) throw new AppError("ERR_INVALID_PARAMETER", 400);
  const note = clean(req.body?.note, 300) || null;
  const row = await sequelize.transaction(async transaction => {
    const r = await SendRelease.findByPk(req.params.id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!r) throw new AppError("ERR_NOT_FOUND", 404);
    if (r.status !== "pending") throw new AppError("ERR_SEND_RELEASE_DECIDED", 409);
    let granted: number | null = null;
    if (action === "approve") {
      granted = req.body?.granted === undefined || req.body?.granted === "" ? r.requested : Math.floor(Number(req.body.granted));
      if (!Number.isFinite(granted) || granted < 1 || granted > 5000) throw new AppError("ERR_SEND_RELEASE_AMOUNT", 400);
    }
    // what is approved counts in the month it is approved (a request of last month approved today serves this month)
    r.set({ status: action === "approve" ? "approved" : "denied", granted, decidedBy: Number(req.user.id), decidedAt: new Date(), decisionNote: note, month: currentMonth() });
    await r.save({ transaction });
    return r;
  });
  await notify([row.userId], {
    kind: "send_release",
    level: action === "approve" ? "info" : "warning",
    title: action === "approve" ? `A gestão liberou mais ${row.granted} ${row.granted === 1 ? "mensagem" : "mensagens"} neste mês` : "A gestão recusou o pedido de liberação de disparos",
    body: note,
    link: null,
    dedupeKey: `send_release_decided:${row.id}`
  });
  return res.json({ id: row.id, status: row.status, granted: row.granted });
};

// ------------------------------------------------------------------ what each person sent and spent (Meta + AI) in the period

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const periodOf = (req: Request): { from: Date; to: Date; fromDay: string; toDay: string } => {
  const today = todayInAppTz();
  const fromDay = DAY.test(String(req.query.from)) ? String(req.query.from) : `${today.slice(0, 8)}01`;
  const toDay = DAY.test(String(req.query.to)) ? String(req.query.to) : today;
  if (fromDay > toDay) throw new AppError("ERR_INVALID_PARAMETER", 400);
  return { from: dayBounds(fromDay).start, to: dayBounds(toDay).end, fromDay, toDay };
};

export const costsByUser = async (req: Request, res: Response): Promise<Response> => {
  const { from, to, fromDay, toDay } = periodOf(req);
  const q = (sql: string) => sequelize.query(sql, { replacements: { from, to }, type: QueryTypes.SELECT }) as Promise<any[]>;
  const [meta, ai, sends, rateRaw] = await Promise.all([
    q(`SELECT "userId", COUNT(*) AS n, COALESCE(SUM("estimatedUsd"), 0) AS usd FROM "OutboundDeliveries"
        WHERE "createdAt" >= :from AND "createdAt" <= :to AND status IN ('sent', 'sending', 'uncertain') GROUP BY "userId"`),
    q(`SELECT "userId", COUNT(*) AS n, COALESCE(SUM("estimatedUsd"), 0) AS usd FROM "AiUsage"
        WHERE "createdAt" >= :from AND "createdAt" <= :to GROUP BY "userId"`),
    q(`SELECT c."createdById" AS "userId", COUNT(DISTINCT c.id) AS campaigns, COUNT(s.id) AS messages FROM "Campaigns" c
        LEFT JOIN "CampaignShippings" s ON s."campaignId" = c.id AND s.status IN ('sent', 'sending', 'uncertain')
        WHERE c."createdAt" >= :from AND c."createdAt" <= :to AND c."createdById" IS NOT NULL GROUP BY c."createdById"`),
    getSetting("outbound_usd_brl", "5.40")
  ]);
  const rate = Number(rateRaw) > 0 ? Number(rateRaw) : 5.4;
  const byUser = new Map<number | null, { metaMessages: number; metaUsd: number; aiCalls: number; aiUsd: number; campaigns: number; messages: number }>();
  const at = (id: any) => {
    const key = Number(id) > 0 ? Number(id) : null;
    if (!byUser.has(key)) byUser.set(key, { metaMessages: 0, metaUsd: 0, aiCalls: 0, aiUsd: 0, campaigns: 0, messages: 0 });
    return byUser.get(key) as any;
  };
  meta.forEach(r => { const o = at(r.userId); o.metaMessages += Number(r.n) || 0; o.metaUsd += Number(r.usd) || 0; });
  ai.forEach(r => { const o = at(r.userId); o.aiCalls += Number(r.n) || 0; o.aiUsd += Number(r.usd) || 0; });
  sends.forEach(r => { const o = at(r.userId); o.campaigns += Number(r.campaigns) || 0; o.messages += Number(r.messages) || 0; });
  const ids = [...byUser.keys()].filter((k): k is number => k !== null);
  const [users, used, extra, quota] = await Promise.all([
    ids.length ? User.findAll({ where: { id: ids }, attributes: ["id", "name", "role", "profile"] }) : Promise.resolve([] as User[]),
    usedThisMonth(ids), extraThisMonth(ids), quotaSetting()
  ]);
  const who = new Map(users.map(u => [u.id, u]));
  const money = (usd: number) => ({ usd: Math.round(usd * 10000) / 10000, brl: Math.round(usd * rate * 100) / 100 });
  const rows = [...byUser.entries()].map(([id, o]) => {
    const u = id ? who.get(id) : null;
    const manager = !!u && isManagerRole(roleOf(u as any));
    return {
      userId: id,
      name: id ? u?.name || `Usuário ${id}` : "Automação",
      automation: id === null,
      campaigns: o.campaigns,
      messages: o.messages,
      quota: id && !manager && quota > 0 ? { quota, extra: extra.get(id) || 0, used: used.get(id) || 0 } : null,
      meta: { messages: o.metaMessages, ...money(o.metaUsd) },
      ai: { calls: o.aiCalls, ...money(o.aiUsd) },
      total: money(o.metaUsd + o.aiUsd)
    };
  }).sort((a, b) => Number(a.automation) - Number(b.automation) || b.total.usd - a.total.usd || a.name.localeCompare(b.name));
  const sum = rows.reduce((t, r) => t + r.meta.usd + r.ai.usd, 0);
  return res.json({ from: fromDay, to: toDay, rate, month: currentMonth(), monthStart: monthStartApp(), rows, total: money(sum) });
};

// the sends of one person in the period: name, objective, when, how many received, the situation and what the Meta charged
export const sendsOfUser = async (req: Request, res: Response): Promise<Response> => {
  const { from, to } = periodOf(req);
  const userId = Number(req.params.userId);
  if (!(userId > 0)) throw new AppError("ERR_INVALID_PARAMETER", 400);
  const campaigns = await Campaign.findAll({
    where: { createdById: userId, createdAt: { [Op.gte]: from, [Op.lte]: to } } as any,
    attributes: ["id", "name", "objective", "status", "createdAt", "startedAt", "finishedAt"],
    order: [["id", "DESC"]],
    limit: 200
  });
  const ids = campaigns.map(c => c.id);
  const stats = ids.length ? (await sequelize.query(
    `SELECT s."campaignId" AS id, COUNT(*) FILTER (WHERE s.status = 'sent') AS sent, COUNT(*) AS total FROM "CampaignShippings" s WHERE s."campaignId" IN (:ids) GROUP BY s."campaignId"`,
    { replacements: { ids }, type: QueryTypes.SELECT }
  )) as any[] : [];
  const cost = ids.length ? (await sequelize.query(
    `SELECT split_part("key", ':', 2)::int AS id, COALESCE(SUM("estimatedUsd"), 0) AS usd FROM "OutboundDeliveries"
      WHERE "key" LIKE 'campaign:%' AND split_part("key", ':', 2) ~ '^[0-9]+$' AND split_part("key", ':', 2)::int IN (:ids) AND status IN ('sent', 'sending', 'uncertain')
      GROUP BY 1`,
    { replacements: { ids }, type: QueryTypes.SELECT }
  )) as any[] : [];
  const st = new Map(stats.map(r => [Number(r.id), r]));
  const usd = new Map(cost.map(r => [Number(r.id), Number(r.usd) || 0]));
  return res.json(campaigns.map(c => ({
    id: c.id, name: c.name, objective: c.objective || null, status: c.status, createdAt: c.createdAt, startedAt: c.startedAt,
    recipients: Number(st.get(c.id)?.total) || 0, sent: Number(st.get(c.id)?.sent) || 0, metaUsd: Math.round((usd.get(c.id) || 0) * 10000) / 10000
  })));
};
