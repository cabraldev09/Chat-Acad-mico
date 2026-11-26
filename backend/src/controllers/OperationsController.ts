import { Request, Response } from "express";
import { Op, QueryTypes } from "sequelize";
import sequelize from "../database";
import { priceInfoOf, PRICES_DATE } from "../services/AiServices/Prices";
import { monthBudget, openaiRealCosts } from "../services/AiServices/RealCosts";
import { OPERATION_DEFAULTS, FINANCIAL_KEYS, validateOperationSetting } from "../helpers/OperationSettings";
import { getSetting, setSetting } from "../helpers/AppSettings";
import { dayBounds } from "../helpers/AppTime";
import { publicFile } from "../helpers/PublicFile";
import { signedFileUrl } from "../helpers/SignedFile";
import AppError from "../errors/AppError";
import Ticket from "../models/Ticket";
import Contact from "../models/Contact";
import User from "../models/User";
import OutboundDelivery from "../models/OutboundDelivery";
import CampaignShipping from "../models/CampaignShipping";
import Schedule from "../models/Schedule";
import AiUsage from "../models/AiUsage";
import AiBudgetReservation from "../models/AiBudgetReservation";
import MetaWebhookEvent from "../models/MetaWebhookEvent";
import Lead from "../models/Lead";
import TicketEvent from "../models/TicketEvent";
import Queue from "../models/Queue";
import Message from "../models/Message";
import { assertTicketAccess } from "../middleware/canAccessTicket";

export const config = async (req: Request, res: Response): Promise<Response> => {
  const keys = Object.keys(OPERATION_DEFAULTS).filter(k => req.user.profile === "admin" || !FINANCIAL_KEYS.includes(k));
  return res.json(Object.fromEntries(await Promise.all(keys.map(async k => [k, await getSetting(k, OPERATION_DEFAULTS[k])]))));
};
export const saveConfig = async (req: Request, res: Response): Promise<Response> => {
  const entries = Object.entries(req.body || {});
  if (entries.length > Object.keys(OPERATION_DEFAULTS).length) throw new AppError("ERR_OPERATION_SETTING", 400);
  const values = entries.map(([k, v]) => {
    if (FINANCIAL_KEYS.includes(k) && req.user.profile !== "admin") throw new AppError("ERR_NO_PERMISSION", 403);
    try { return [k, validateOperationSetting(k, v)] as const; } catch (_) { throw new AppError("ERR_OPERATION_SETTING", 400); }
  });
  await sequelize.transaction(async () => { for (const [k, v] of values) await setSetting(k, v); });
  return config(req, res);
};
export const summary = async (req: Request, res: Response): Promise<Response> => {
  const since = dayBounds().start;
  const [unassigned, uncertain, users, queues, shippings, schedules, metaWebhooks] = await Promise.all([
    Ticket.findAll({ where: { status: { [Op.in]: ["pending", "open"] }, userId: null as any, aiActive: false, isGroup: false, isHistorical: false }, include: [{ model: Contact, as: "contact", attributes: ["id", "name"], where: { isStaff: false, noReply: false, optOut: false, kind: "person" } }], order: [["updatedAt", "ASC"]], limit: 50 }),
    OutboundDelivery.findAll({ where: { status: { [Op.in]: ["uncertain", "sending"] }, [Op.or]: [{ error: null as any }, { error: { [Op.notLike]: "Revisão manual:%" } }] }, order: [["createdAt", "ASC"]], limit: 50 }),
    User.findAll({ attributes: ["id", "name", "acceptsNewTickets", "maxOpenTickets"] }),
    Queue.findAll({ attributes: ["id", "name"] }),
    CampaignShipping.findAll({ where: { status: "uncertain" }, attributes: ["id", "campaignId", "name", "error"], limit: 50 }),
    Schedule.findAll({ where: { status: "uncertain" }, attributes: ["id", "contactId", "error"], limit: 50 }),
    MetaWebhookEvent.findAll({ where: { status: "failed" }, attributes: ["id", "whatsappId", "attempts", "updatedAt"], order: [["updatedAt", "ASC"]], limit: 20 })
  ]);
  // the spending of the day, every number in parallel (admin only)
  const spend = req.user.profile === "admin" ? await (async () => {
    const sent = { createdAt: { [Op.gte]: since }, status: { [Op.in]: ["sent", "sending", "uncertain"] } };
    const [aiUsd, aiUnpriced, reserved, messages, metaUsd, metaUnpriced, qualified, enrollments] = await Promise.all([
      AiUsage.sum("estimatedUsd", { where: { createdAt: { [Op.gte]: since } } }),
      AiUsage.count({ where: { createdAt: { [Op.gte]: since }, estimatedUsd: null as any } }),
      AiBudgetReservation.sum("tokens", { where: { expiresAt: { [Op.gt]: new Date() } } }),
      OutboundDelivery.count({ where: sent as any }),
      OutboundDelivery.sum("estimatedUsd", { where: sent as any }),
      OutboundDelivery.count({ where: { createdAt: { [Op.gte]: since }, channel: { [Op.in]: ["whatsapp_cloud", "messenger", "instagram"] }, estimatedUsd: null as any } }),
      TicketEvent.count({ distinct: true, col: "ticketId", where: { type: "ai_qualified", createdAt: { [Op.gte]: since } } }),
      Lead.count({ where: { enrolledAt: { [Op.gte]: since } } })
    ]);
    return {
      aiEstimatedUsd: Number(aiUsd || 0), aiUnpricedCalls: aiUnpriced, aiReservedTokens: Number(reserved || 0), messages,
      metaEstimatedUsd: Number(metaUsd || 0), metaUnpricedMessages: metaUnpriced, qualified, enrollments
    };
  })() : null;
  // the open conversations of each person in one grouped query (not one count per person)
  const open = (await Ticket.count({ where: { status: { [Op.ne]: "closed" }, userId: { [Op.ne]: null } } as any, group: ["userId"] })) as unknown as Array<{ userId: number; count: number }>;
  const openOf = new Map(open.map(r => [Number(r.userId), Number(r.count)]));
  return res.json({ unassigned, uncertain, shippings, schedules, metaWebhooks, queues, users: users.map(u => ({ ...u.toJSON(), openTickets: openOf.get(u.id) || 0 })), spend });
};
export const capacity = async (req: Request, res: Response): Promise<Response> => {
  const user = await User.findByPk(req.params.id);
  if (!user) throw new AppError("ERR_NO_USER_FOUND", 404);
  if (user.profile === "admin" && req.user.profile !== "admin") throw new AppError("ERR_NO_PERMISSION", 403);
  const cap = Number(req.body.maxOpenTickets);
  if (!Number.isInteger(cap) || cap < 0 || cap > 1000 || typeof req.body.acceptsNewTickets !== "boolean") throw new AppError("ERR_OPERATION_SETTING", 400);
  await user.update({ acceptsNewTickets: req.body.acceptsNewTickets, maxOpenTickets: cap });
  return res.json({ ok: true });
};
export const reconcile = async (req: Request, res: Response): Promise<Response> => {
  if (!["sent", "failed"].includes(req.body.status)) throw new AppError("ERR_OPERATION_SETTING", 400);
  const id = Number(req.params.id);
  const kind = req.params.kind;
  if (!["schedule", "campaign", "delivery"].includes(kind)) throw new AppError("ERR_NOT_FOUND", 404);
  await sequelize.transaction(async transaction => {
    if (kind === "delivery") {
      const delivery = await OutboundDelivery.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
      if (!delivery || delivery.status !== "uncertain") throw new AppError("ERR_DELIVERY_NOT_UNCERTAIN", 409);
      await delivery.update({ status: req.body.status === "sent" ? "sent" : "uncertain", error: `Revisão manual: ${req.body.status}, por ${req.user.id}` }, { transaction });
      return;
    }
    const row = kind === "schedule" ? await Schedule.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE }) : await CampaignShipping.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!row || row.status !== "uncertain") throw new AppError("ERR_DELIVERY_NOT_UNCERTAIN", 409);
    await (row as Schedule).update({ status: req.body.status, ...(req.body.status === "sent" ? { sentAt: new Date() } : {}), error: `Entrega conferida manualmente por ${req.user.id}` }, { transaction });
    const key = kind === "schedule" ? `schedule:${id}` : `campaign:${(row as CampaignShipping).campaignId}:${id}:${(row as CampaignShipping).stepsDone || 0}`;
    // Keep ambiguous attempts reserved: manual review does not establish the provider's billing result.
    await OutboundDelivery.update({ status: req.body.status === "sent" ? "sent" : "uncertain", error: `Revisão manual: ${req.body.status}` }, { where: { key }, transaction });
  });
  return res.json({ ok: true });
};
export const fileLink = async (req: Request, res: Response): Promise<Response> => {
  const message = await Message.findByPk(req.params.id);
  if (!message || message.isDeleted || !message.getDataValue("mediaUrl")) throw new AppError("ERR_MEDIA_NOT_FOUND", 404);
  await assertTicketAccess(req, message.ticketId, "read");
  return res.json({ url: signedFileUrl(String(message.getDataValue("mediaUrl")), message.id) });
};
export const revokeFile = async (req: Request, res: Response): Promise<Response> => {
  const filename = String(req.body.filename || "");
  publicFile(filename);
  await setSetting(`file_revoked_${filename}`, "true");
  return res.json({ ok: true });
};

// "Custos" in Configurações: what the AI (OpenAI and Anthropic) spent in the period, by day, by use and by model, from the
// usage the system records on every call. Prices are the ones typed in Agentes de IA > Uso (US$ per million tokens);
// a call of a model without a price counts its tokens but not its value.
const KIND_LABEL: Record<string, string> = {
  reply: "Atendimento da IA", summary: "Resumos e leituras", test: "Testes do agente", copilot: "Copiloto do consultor", reading: "Leitura de documentos e prints"
};
const providerOf = (model: string): string => (/claude|anthropic|opus|sonnet|haiku|fable/i.test(model) ? "Anthropic" : /gpt|o\d|openai|whisper|text-embedding/i.test(model) ? "OpenAI" : "Outro");
export const aiCosts = async (req: Request, res: Response): Promise<Response> => {
  const days = Math.min(92, Math.max(1, Number(req.query.days) || 30));
  const since = new Date(dayBounds().start.getTime() - (days - 1) * 86400000);
  const rows = (await sequelize.query(
    `SELECT to_char("createdAt" AT TIME ZONE :tz, 'YYYY-MM-DD') AS day, COALESCE(model, '') AS model, COALESCE(kind, '') AS kind,
            COUNT(*)::int AS calls, COALESCE(SUM("inputTokens"), 0)::bigint AS input, COALESCE(SUM("outputTokens"), 0)::bigint AS output,
            COALESCE(SUM("estimatedUsd"), 0)::float AS usd, SUM(CASE WHEN "estimatedUsd" IS NULL THEN 1 ELSE 0 END)::int AS unpriced
       FROM "AiUsage" WHERE "createdAt" >= :since GROUP BY 1, 2, 3`,
    { replacements: { since, tz: await getSetting("appTimezone", "America/Porto_Velho") }, type: QueryTypes.SELECT }
  )) as Array<{ day: string; model: string; kind: string; calls: number; input: string | number; output: string | number; usd: number; unpriced: number }>;
  const add = (map: Map<string, any>, key: string, label: string, r: typeof rows[number]) => {
    const cur = map.get(key) || { key, label, calls: 0, tokens: 0, usd: 0, unpriced: 0 };
    cur.calls += r.calls; cur.tokens += Number(r.input) + Number(r.output); cur.usd += Number(r.usd) || 0; cur.unpriced += r.unpriced;
    map.set(key, cur);
  };
  const byDay = new Map<string, any>(); const byKind = new Map<string, any>(); const byModel = new Map<string, any>(); const byProvider = new Map<string, any>();
  rows.forEach(r => {
    add(byDay, r.day, r.day, r);
    add(byKind, r.kind || "outro", KIND_LABEL[r.kind] || (r.kind ? r.kind : "Outro"), r);
    add(byModel, r.model || "?", r.model || "Modelo não informado", r);
    add(byProvider, providerOf(r.model), providerOf(r.model), r);
  });
  const round = (x: any) => ({ ...x, usd: Math.round(x.usd * 10000) / 10000 });
  const sort = (m: Map<string, any>) => [...m.values()].map(round).sort((a, b) => b.usd - a.usd || b.tokens - a.tokens);
  const total = rows.reduce((a, r) => ({ calls: a.calls + r.calls, tokens: a.tokens + Number(r.input) + Number(r.output), usd: a.usd + (Number(r.usd) || 0), unpriced: a.unpriced + r.unpriced }), { calls: 0, tokens: 0, usd: 0, unpriced: 0 });
  return res.json({
    days,
    total: round(total),
    byDay: [...byDay.values()].map(round).sort((a, b) => a.key.localeCompare(b.key)),
    byKind: sort(byKind),
    byModel: sort(byModel),
    byProvider: sort(byProvider),
    caps: { dailyUsd: Number(await getSetting("ai_daily_usd_cap", "0")) || 0, dailyTokens: Number(await getSetting("ai_daily_token_cap", "0")) || 0 },
    // the price used for each model of the period: the one typed in Agentes de IA → Uso or the reference price (with the date of the table)
    prices: await Promise.all([...byModel.keys()].filter(m => m && m !== "?").map(async model => ({ model, ...(await priceInfoOf(model)) }))),
    pricesDate: PRICES_DATE,
    // what the OpenAI really charged in the same days (needs the administrator key) and the budget of the month
    real: await openaiRealCosts(since).catch(() => null),
    budget: await monthBudget().catch(() => null)
  });
};
