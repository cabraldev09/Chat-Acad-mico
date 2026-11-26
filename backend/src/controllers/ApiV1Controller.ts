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

// A token of some polos never learns whether a person is already registered somewhere else: every answer to it is the same
// `202 { aceito: true }` (a new person, one of its polos or one of another polo). A person of another polo, or of no polo, is never
// changed; the administration gets a notice of the possible duplicate (no personal data goes back to the caller). Tokens of every polo
// keep the former answers (id and created), as the integrations already in use expect.
const ACCEPTED = { aceito: true };
const noticeOtherPolo = async (kind: "lead" | "contato", key: string): Promise<void> => {
  try {
    const { notify } = await import("../services/NotificationServices/Notify");
    const { default: User } = await import("../models/User");
    const admins = (await User.findAll({ where: { [Op.or]: [{ profile: "admin" }, { role: "admin" }] } as any, attributes: ["id"] })).map(u => u.id);
    await notify(admins, {
      kind: "api_duplicate",
      level: "info",
      title: `Integração enviou um ${kind} que já existe em outro polo`,
      body: "Um token de API limitado a polos enviou uma pessoa já cadastrada fora dos polos dele. Nada foi alterado. Confira se é a mesma pessoa e para qual polo ela deve ir.",
      link: "/crm",
      dedupeKey: `api-duplicate:${key}`
    });
  } catch (_) {
    /* the notice is a courtesy: the answer to the integration does not depend on it */
  }
};

export const upsertContact = async (req: Request, res: Response): Promise<Response> => {
  const { name, number, email } = req.body;
  const digits = String(number || "").replace(/\D/g, "");
  if (!digits) throw new AppError("ERR_FIELD_REQUIRED_number");
  const polos = polosOf(req);
  const existing = polos
    ? await Contact.findOne({ where: { number: { [Op.in]: brPhoneVariants(digits) } }, order: [["id", "ASC"]] })
    : await Contact.findOne({ where: { number: digits } });
  if (existing) {
    if (polos) {
      // a token of some polos changes only a person who is a lead of one of them (never one of another polo, nor one it cannot see)
      const { default: Lead } = await import("../models/Lead");
      const outside = await Lead.count({ where: { contactId: existing.id, [Op.or]: [{ poloId: null }, { poloId: { [Op.notIn]: polos.length ? polos : [0] } }] } as any });
      const mine = await Lead.count({ where: { contactId: existing.id, poloId: { [Op.in]: polos.length ? polos : [0] } } as any });
      if (outside || !mine) {
        await noticeOtherPolo("contato", `contact:${existing.id}`);
        return res.status(202).json(ACCEPTED);
      }
      await existing.update({ name: name || existing.name, email: email || existing.email });
      return res.status(202).json(ACCEPTED);
    }
    await existing.update({ name: name || existing.name, email: email || existing.email });
    return res.json({ id: existing.id, created: false });
  }
  const created = await Contact.create({ name: name || digits, number: digits, email: email || "" });
  if (polos) return res.status(202).json(ACCEPTED);
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
  const { contactId: _contact, affiliateId: _affiliate, poloId: askedPolo, ...safe } = b;
  // a token of some polos: the lead is of one of its polos, never touches a lead of another polo, and the stage and the owner are of its scope
  const polos = polosOf(req);
  let polo: number | null = null;
  if (polos) {
    polo = askedPolo !== undefined && askedPolo !== null && askedPolo !== "" ? Number(askedPolo) : polos.length === 1 ? polos[0] : NaN;
    if (!Number.isInteger(polo)) throw new AppError("ERR_API_TOKEN_POLO_REQUIRED", 422);
    if (!polos.includes(polo as number)) throw new AppError("ERR_API_TOKEN_POLO", 403);
    const { default: LeadStage } = await import("../models/LeadStage");
    const { default: PoloMember } = await import("../models/PoloMember");
    const { findDuplicate } = await import("../services/CrmServices/LeadCore");
    const { normalizeCpf } = await import("../helpers/Cpf");
    if (b.stageId !== undefined && b.stageId !== null && b.stageId !== "") {
      const stage = await LeadStage.findByPk(Number(b.stageId), { attributes: ["id", "type"] });
      // a new lead enters an open stage: never straight into Matriculado or Perdido
      if (!stage || stage.type !== "open") throw new AppError("ERR_API_STAGE_NOT_ALLOWED", 422);
    }
    if (b.ownerId !== undefined && b.ownerId !== null && b.ownerId !== "") {
      const member = await PoloMember.count({ where: { userId: Number(b.ownerId), poloId: { [Op.in]: polos } } as any });
      if (!member) throw new AppError("ERR_API_OWNER_NOT_ALLOWED", 422);
    }
    // the same person already in the CRM: only a lead of the token's polos is enriched (nothing is written on a lead of another polo,
    // and the answer is the same either way)
    const phone = normalizePhone(b.phone);
    const contact = phone ? await Contact.findOne({ where: { number: { [Op.in]: brPhoneVariants(phone) } }, attributes: ["id"], order: [["id", "ASC"]] }) : null;
    const twin = await findDuplicate(phone, normalizeEmail(b.email), contact ? contact.id : null, normalizeCpf(b.cpf), b.institutionId);
    if (twin && !polos.includes(Number(twin.poloId))) {
      await noticeOtherPolo("lead", `lead:${twin.id}`);
      return res.status(202).json(ACCEPTED);
    }
    // the lead is born in the polo of the token (before any notice, webhook or flow) and goes to a consultant of that polo
    const { default: User } = await import("../models/User");
    const members = (await PoloMember.findAll({ where: { poloId: polo }, attributes: ["userId"] })).map(m => m.userId);
    const pool = members.length
      ? (await User.findAll({ where: { id: { [Op.in]: members }, [Op.or]: [{ role: "consultor" }, { role: null }, { role: "" }] } as any, attributes: ["id"] })).map(u => u.id)
      : [];
    await upsertLead({ ...safe, name: b.name, source: b.source || "API", pinPolo: polo, ownerPool: pool } as any);
    return res.status(202).json(ACCEPTED);
  }
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

// POST /api/v1/insights: a warning or recommendation of the OpenBot for the management (administrators only; no personal data, checked here).
// Always the same short answer, with no id: 201 {"aceito": true}, or 200 {"duplicado": true} when the subject is already in force.
// Not filtered by polo: it is about the whole operation, whatever the polos of the token (docs/API-V1.md).
export const createInsight = async (req: Request, res: Response): Promise<Response> => {
  const { cleanInsight } = await import("../helpers/InsightRules");
  const { recordInsight } = await import("../services/InsightServices/OpenbotInsights");
  const input = cleanInsight(req.body);
  const caller = apiCaller(req);
  let result;
  try {
    result = await recordInsight(input, caller.id);
  } catch (err: any) {
    // a full panel clears as the recommendations expire or are dismissed: try again in an hour
    if (err?.message === "ERR_INSIGHT_LIMIT") res.setHeader("Retry-After", "3600");
    throw err;
  }
  if (result.duplicated) return res.status(200).json({ duplicado: true });
  return res.status(201).json({ aceito: true });
};

// GET /api/v1/indicadores?de=AAAA-MM-DD&ate=AAAA-MM-DD&polo=<id>: totals and codes only (services/IndicatorServices/Indicators)
// One computation per token, period and polo for a minute (helpers/TtlCache): the cache key carries the token, its scopes and its polos,
// so two tokens never share an answer (the consultant codes are per token, and the polos may differ)
export const INDICATORS_CACHE_MS = Number(process.env.API_INDICATORS_CACHE_MS ?? 60000);
export const indicators = async (req: Request, res: Response): Promise<Response> => {
  const { buildIndicators, cleanIndicatorQuery, assertPseudonymSecret } = await import("../services/IndicatorServices/Indicators");
  const { remember } = await import("../helpers/TtlCache");
  // no secret for the consultant codes: fail closed, before any number is read (see IndicatorQuery.pseudonymSecret)
  assertPseudonymSecret();
  const caller = apiCaller(req);
  const query = cleanIndicatorQuery(req.query, polosOf(req));
  const tokenKey = caller?.id ? `token:${caller.id}` : "legacy";
  const cacheKey = ["indicadores", tokenKey, (caller?.scopes || []).slice().sort().join(","), (query.tokenPolos || ["all"]).join(","), query.from, query.to, query.poloId || ""].join("|");
  return res.json(await remember(cacheKey, INDICATORS_CACHE_MS, () => buildIndicators(query, new Date(), tokenKey)));
};

// THE QUEUE OF READINGS for an outside worker: up to `limite` conversations (masked: no name, phone, CPF, e-mail or number), reserved for 30
// minutes to this token; the answer is the JSON the instructions of each one ask for. A token of some polos takes only readings of them.
const claimKeyOf = (req: Request): string => {
  const caller: any = apiCaller(req);
  return `token:${caller.id || "legacy"}`;
};
export const takeReadings = async (req: Request, res: Response): Promise<Response> => {
  const { claimReadings } = await import("../services/ReadingServices/Queue");
  const leituras = await claimReadings(claimKeyOf(req), Math.min(Number(req.query.limite) || 10, 50), polosOf(req));
  return res.json({ leituras });
};
export const answerReading = async (req: Request, res: Response): Promise<Response> => {
  const { completeReading } = await import("../services/ReadingServices/Queue");
  const body = req.body?.resposta ?? req.body;
  const text = typeof body === "string" ? body : JSON.stringify(body || {});
  const result = await completeReading(Number(req.params.id), text, { who: "openbot", claimKey: claimKeyOf(req), model: req.body?.modelo ? String(req.body.modelo).slice(0, 60) : "openbot", tokens: null });
  return res.json({ ok: true, resultado: result });
};
