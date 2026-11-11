import { Request, Response } from "express";
import { Op } from "sequelize";
import sequelize from "../database";
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
  const fallback = values.find(([k]) => k === "crm_fallback_queue_id")?.[1];
  if (Number(fallback) && !(await Queue.findByPk(Number(fallback)))) throw new AppError("ERR_NO_QUEUE_FOUND", 404);
  await sequelize.transaction(async () => { for (const [k, v] of values) await setSetting(k, v); });
  return config(req, res);
};
export const summary = async (req: Request, res: Response): Promise<Response> => {
  const since = dayBounds().start;
  const [unassigned, uncertain, users, queues, shippings, schedules] = await Promise.all([
    Ticket.findAll({ where: { status: { [Op.in]: ["pending", "open"] }, userId: null as any, aiActive: false, isGroup: false, isHistorical: false }, include: [{ model: Contact, as: "contact", attributes: ["id", "name"], where: { isStaff: false, noReply: false, optOut: false, kind: "person" } }], order: [["updatedAt", "ASC"]], limit: 50 }),
    OutboundDelivery.findAll({ where: { status: { [Op.in]: ["uncertain", "sending"] }, [Op.or]: [{ error: null as any }, { error: { [Op.notLike]: "Revisão manual:%" } }] }, order: [["createdAt", "ASC"]], limit: 50 }),
    User.findAll({ attributes: ["id", "name", "acceptsNewTickets", "maxOpenTickets"] }),
    Queue.findAll({ attributes: ["id", "name"] }),
    CampaignShipping.findAll({ where: { status: "uncertain" }, attributes: ["id", "campaignId", "name", "error"], limit: 50 }),
    Schedule.findAll({ where: { status: "uncertain" }, attributes: ["id", "contactId", "error"], limit: 50 })
  ]);
  const spend = req.user.profile === "admin" ? {
    aiEstimatedUsd: Number(await AiUsage.sum("estimatedUsd", { where: { createdAt: { [Op.gte]: since } } }) || 0),
    aiUnpricedCalls: await AiUsage.count({ where: { createdAt: { [Op.gte]: since }, estimatedUsd: null as any } }),
    aiReservedTokens: Number(await AiBudgetReservation.sum("tokens", { where: { expiresAt: { [Op.gt]: new Date() } } }) || 0),
    messages: await OutboundDelivery.count({ where: { createdAt: { [Op.gte]: since }, status: { [Op.in]: ["sent", "sending", "uncertain"] } } }),
    metaEstimatedUsd: Number(await OutboundDelivery.sum("estimatedUsd", { where: { createdAt: { [Op.gte]: since }, status: { [Op.in]: ["sent", "sending", "uncertain"] } } }) || 0),
    metaUnpricedMessages: await OutboundDelivery.count({ where: { createdAt: { [Op.gte]: since }, channel: { [Op.in]: ["whatsapp_cloud", "messenger", "instagram"] }, estimatedUsd: null as any } }),
    qualified: await TicketEvent.count({ distinct: true, col: "ticketId", where: { type: "ai_qualified", createdAt: { [Op.gte]: since } } }),
    enrollments: await Lead.count({ where: { enrolledAt: { [Op.gte]: since } } })
  } : null;
  return res.json({ unassigned, uncertain, shippings, schedules, queues, users: await Promise.all(users.map(async u => ({ ...u.toJSON(), openTickets: await Ticket.count({ where: { userId: u.id, status: { [Op.ne]: "closed" } } }) }))), spend });
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
