import { Request, Response } from "express";
import { Op } from "sequelize";

import Contact from "../models/Contact";
import Ticket from "../models/Ticket";
import Whatsapp from "../models/Whatsapp";
import AppError from "../errors/AppError";
import GetDefaultWhatsApp from "../helpers/GetDefaultWhatsApp";
import SendToContact from "../services/ChannelServices/SendToContact";
import { resolveOutboundContact } from "../services/ChannelServices/ResolveOutboundContact";
import ListWhatsAppsService from "../services/WhatsappService/ListWhatsAppsService";

export const sendMessage = async (req: Request, res: Response): Promise<Response> => {
  const { number, body, whatsappId, name } = req.body;
  if (!number || !body) throw new AppError("ERR_FIELDS_REQUIRED_number_body");
  const whatsapp = whatsappId
    ? await Whatsapp.findByPk(whatsappId)
    : await GetDefaultWhatsApp();
  if (!whatsapp) throw new AppError("ERR_NO_WAPP_FOUND", 404);
  const contact = await resolveOutboundContact(whatsapp, String(number), name || "");
  await SendToContact({ contact, whatsapp, body, mediaUrl: null });
  return res.json({ message: "queued", contactId: contact.id });
};

export const tickets = async (req: Request, res: Response): Promise<Response> => {
  const where: any = {};
  if (req.query.status) where.status = req.query.status;
  const rows = await Ticket.findAll({
    where,
    include: [{ model: Contact, as: "contact", attributes: ["id", "name", "number"] }],
    order: [["updatedAt", "DESC"]],
    limit: Math.min(Number(req.query.limit) || 50, 200)
  });
  return res.json(rows);
};

export const contacts = async (req: Request, res: Response): Promise<Response> => {
  const search = String(req.query.search || "");
  const rows = await Contact.findAll({
    where: search
      ? { [Op.or]: [{ name: { [Op.like]: `%${search}%` } }, { number: { [Op.like]: `%${search}%` } }] }
      : {},
    order: [["id", "DESC"]],
    limit: Math.min(Number(req.query.limit) || 50, 200)
  });
  return res.json(rows);
};

export const upsertContact = async (req: Request, res: Response): Promise<Response> => {
  const { name, number, email } = req.body;
  const digits = String(number || "").replace(/\D/g, "");
  if (!digits) throw new AppError("ERR_FIELD_REQUIRED_number");
  const existing = await Contact.findOne({ where: { number: digits } });
  if (existing) {
    await existing.update({ name: name || existing.name, email: email || existing.email });
    return res.json(existing);
  }
  const created = await Contact.create({ name: name || digits, number: digits, email: email || "" });
  return res.status(201).json(created);
};

export const leads = async (req: Request, res: Response): Promise<Response> => {
  const { default: Lead } = await import("../models/Lead");
  const { leadInclude } = await import("../services/CrmServices/LeadCore");
  const rows = await Lead.findAll({
    include: leadInclude as any,
    order: [["id", "DESC"]],
    limit: Math.min(Number(req.query.limit) || 50, 200)
  });
  return res.json(rows);
};

export const createLead = async (req: Request, res: Response): Promise<Response> => {
  const { upsertLead } = await import("../services/CrmServices/LeadCore");
  const { normalizePhone, normalizeEmail } = await import("../helpers/Phone");
  const b = req.body || {};
  if (!normalizePhone(b.phone) && !normalizeEmail(b.email)) {
    throw new AppError("ERR_LEAD_NEEDS_PHONE_OR_EMAIL");
  }
  const { lead, created } = await upsertLead({ ...b, name: b.name, source: b.source || "API" });
  return res.status(created ? 201 : 200).json({ created, lead });
};

export const connections = async (_req: Request, res: Response): Promise<Response> => {
  const rows = await ListWhatsAppsService();
  return res.json(
    rows.map(w => ({ id: w.id, name: w.name, channel: w.channel, status: w.status }))
  );
};
