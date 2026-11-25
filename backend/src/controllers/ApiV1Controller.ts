import { Request, Response } from "express";
import { Op, literal } from "sequelize";

import Contact from "../models/Contact";
import Ticket from "../models/Ticket";
import Whatsapp from "../models/Whatsapp";
import AppError from "../errors/AppError";
import GetDefaultWhatsApp from "../helpers/GetDefaultWhatsApp";
import { brPhoneVariants } from "../helpers/PhoneVariants";
import { apiCaller } from "../middleware/apiScope";
import SendToContact from "../services/ChannelServices/SendToContact";
import { resolveOutboundContact } from "../services/ChannelServices/ResolveOutboundContact";
import ListWhatsAppsService from "../services/WhatsappService/ListWhatsAppsService";

// The API v1 answers only what an integration needs (no CPF, no notes, no conversation text), and a token limited to some polos reads and
// writes only what is of those polos (helpers/ApiTokens). The scope of each route is checked before (middleware/apiScope).
// "AND col IN (1, 2)" with whole numbers only; no polo = nothing
const poloSql = (polos: number[], col: string): string => `AND ${col} IN (${polos.map(Number).filter(n => Number.isInteger(n) && n > 0).join(", ") || "0"})`;
const limit = (req: Request) => Math.min(Number(req.query.limit) || 50, 200);
const polosOf = (req: Request): number[] | null => apiCaller(req).poloIds;
const leadsOfPolos = (polos: number[]) => literal(`(SELECT l."contactId" FROM "Leads" l WHERE l."contactId" IS NOT NULL ${poloSql(polos, 'l."poloId"')})`);

export const sendMessage = async (req: Request, res: Response): Promise<Response> => {
  const { number, body, whatsappId, name } = req.body;
  if (!number || !body) throw new AppError("ERR_FIELDS_REQUIRED_number_body");
  // a token of some polos writes only to people of those polos (a lead of one of them with this number)
  const polos = polosOf(req);
  if (polos) {
    const { default: Lead } = await import("../models/Lead");
    const found = await Lead.count({ where: { phone: { [Op.in]: brPhoneVariants(String(number)) }, poloId: { [Op.in]: polos.length ? polos : [0] } } as any });
    if (!found) throw new AppError("ERR_API_TOKEN_POLO", 403);
  }
  const whatsapp = whatsappId
    ? await Whatsapp.findByPk(whatsappId)
    : await GetDefaultWhatsApp();
  if (!whatsapp) throw new AppError("ERR_NO_WAPP_FOUND", 404);
  const contact = await resolveOutboundContact(whatsapp, String(number), name || "");
  await SendToContact({ contact, whatsapp, body, mediaUrl: null });
  return res.json({ message: "queued", contactId: contact.id });
};

// the conversations without their text: who, which status, which number and queue, when
export const tickets = async (req: Request, res: Response): Promise<Response> => {
  const where: any = {};
  if (req.query.status) where.status = String(req.query.status);
  const polos = polosOf(req);
  if (polos) where.queueId = { [Op.in]: literal(`(SELECT q.id FROM "Queues" q WHERE true ${poloSql(polos, 'q."poloId"')})`) };
  const rows = await Ticket.findAll({
    where,
    attributes: ["id", "status", "contactId", "whatsappId", "queueId", "userId", "unreadMessages", "createdAt", "updatedAt"],
    include: [{ model: Contact, as: "contact", attributes: ["id", "name", "number"] }],
    order: [["updatedAt", "DESC"]],
    limit: limit(req)
  });
  return res.json(rows);
};

export const contacts = async (req: Request, res: Response): Promise<Response> => {
  const search = String(req.query.search || "");
  const polos = polosOf(req);
  const where: any = search ? { [Op.or]: [{ name: { [Op.like]: `%${search}%` } }, { number: { [Op.like]: `%${search}%` } }] } : {};
  if (polos) where.id = { [Op.in]: leadsOfPolos(polos) };
  const rows = await Contact.findAll({ where, attributes: ["id", "name", "number", "email", "createdAt", "updatedAt"], order: [["id", "DESC"]], limit: limit(req) });
  return res.json(rows);
};

// answers only the id: the integration already has the data it sent (an existing contact is never read back through here)
export const upsertContact = async (req: Request, res: Response): Promise<Response> => {
  const { name, number, email } = req.body;
  const digits = String(number || "").replace(/\D/g, "");
  if (!digits) throw new AppError("ERR_FIELD_REQUIRED_number");
  const existing = await Contact.findOne({ where: { number: digits } });
  const polos = polosOf(req);
  if (existing) {
    // a token of some polos does not change a person who is a lead of another polo
    if (polos) {
      const { default: Lead } = await import("../models/Lead");
      const outside = await Lead.count({ where: { contactId: existing.id, [Op.or]: [{ poloId: null }, { poloId: { [Op.notIn]: polos.length ? polos : [0] } }] } as any });
      if (outside) throw new AppError("ERR_API_TOKEN_POLO", 403);
    }
    await existing.update({ name: name || existing.name, email: email || existing.email });
    return res.json({ id: existing.id, created: false });
  }
  const created = await Contact.create({ name: name || digits, number: digits, email: email || "" });
  return res.status(201).json({ id: created.id, created: true });
};

// the fields an integration uses (never CPF, address, notes or the history)
const LEAD_FIELDS = ["id", "name", "phone", "email", "source", "stageId", "poloId", "courseId", "ownerId", "utmSource", "utmMedium", "utmCampaign", "firstContactAt", "enrolledAt", "createdAt", "updatedAt"];

export const leads = async (req: Request, res: Response): Promise<Response> => {
  const { default: Lead } = await import("../models/Lead");
  const { default: LeadStage } = await import("../models/LeadStage");
  const polos = polosOf(req);
  const rows = await Lead.findAll({
    where: polos ? ({ poloId: { [Op.in]: polos.length ? polos : [0] } } as any) : {},
    attributes: LEAD_FIELDS,
    include: [{ model: LeadStage, as: "stage", attributes: ["id", "name", "type"] }],
    order: [["id", "DESC"]],
    limit: limit(req)
  });
  // plain fields only (the model adds CPF markers to its JSON)
  return res.json(rows.map(l => {
    const out: any = {};
    LEAD_FIELDS.forEach(k => { out[k] = (l as any).get(k) ?? null; });
    const stage = (l as any).stage;
    out.stage = stage ? { id: stage.id, name: stage.name, type: stage.type } : null;
    return out;
  }));
};

export const createLead = async (req: Request, res: Response): Promise<Response> => {
  const { upsertLead } = await import("../services/CrmServices/LeadCore");
  const { normalizePhone, normalizeEmail } = await import("../helpers/Phone");
  const b = req.body || {};
  if (!normalizePhone(b.phone) && !normalizeEmail(b.email)) {
    throw new AppError("ERR_LEAD_NEEDS_PHONE_OR_EMAIL");
  }
  // an integration creates leads from its own data: it never chooses the contact it attaches to nor the affiliate that earns the bonus
  const { contactId: _contact, affiliateId: _affiliate, ...safe } = b;
  const { lead, created } = await upsertLead({ ...safe, name: b.name, source: b.source || "API" });
  // the answer: what the lead is now in the funnel, not the whole record (a lead that already existed is not read back through here)
  return res.status(created ? 201 : 200).json({ created, lead: { id: lead.id, stageId: lead.stageId, poloId: lead.poloId ?? null } });
};

export const connections = async (_req: Request, res: Response): Promise<Response> => {
  const rows = await ListWhatsAppsService();
  return res.json(
    rows.map(w => ({ id: w.id, name: w.name, channel: w.channel, status: w.status }))
  );
};

// GET /api/v1/indicadores?de=AAAA-MM-DD&ate=AAAA-MM-DD&polo=<id>: totals and codes only (services/IndicatorServices/Indicators)
export const indicators = async (req: Request, res: Response): Promise<Response> => {
  const { buildIndicators, cleanIndicatorQuery } = await import("../services/IndicatorServices/Indicators");
  return res.json(await buildIndicators(cleanIndicatorQuery(req.query, polosOf(req))));
};
