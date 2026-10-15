import { Op } from "sequelize";

import Lead from "../../models/Lead";
import LeadStage from "../../models/LeadStage";
import LeadActivity from "../../models/LeadActivity";
import Course from "../../models/Course";
import User from "../../models/User";
import Contact from "../../models/Contact";
import Tag from "../../models/Tag";
import Whatsapp from "../../models/Whatsapp";
import Ticket from "../../models/Ticket";
import Payment from "../../models/Payment";
import { getIO } from "../../libs/socket";
import { getSetting, setSetting } from "../../helpers/AppSettings";
import { normalizeEmail, normalizePhone } from "../../helpers/Phone";
import { normalizeCpf } from "../../helpers/Cpf";
import dispatchWebhook from "../WebhookServices/DispatchWebhook";
import { computeScore } from "./LeadScore";
import { logger } from "../../utils/logger";
import Affiliate from "../../models/Affiliate";
import { affiliateStageId, ensureAffiliateStage, tagAffiliateLead } from "../AffiliateServices/AffiliateLane";

export const leadInclude = [
  { model: Course, as: "course", attributes: ["id", "name", "modality", "level"] },
  { model: LeadStage, as: "stage" },
  { model: User, as: "owner", attributes: ["id", "name"] },
  { model: Affiliate, as: "affiliate", attributes: ["id", "name"] },
  { model: Contact, as: "contact", attributes: ["id", "name", "number", "profilePicUrl", "channel"] },
  { model: Tag, as: "tags", attributes: ["id", "name", "color"], through: { attributes: [] } },
  // only paid enrollment fees: lets cards show a "taxa paga" badge
  { model: Payment, as: "payments", attributes: ["id", "paidAt"], required: false, where: { status: "paid" } }
];

export const loadLead = (id: number | string) => Lead.findByPk(id, { include: leadInclude as any });

const emitLead = (action: string, lead: Lead) =>
  getIO().emit("lead", { action, lead });

export const addActivity = async (
  leadId: number,
  userId: number | null | undefined,
  type: string,
  body: string,
  meta?: unknown
): Promise<LeadActivity> =>
  LeadActivity.create({
    leadId,
    userId: userId || null,
    type,
    body,
    meta: meta ? JSON.stringify(meta) : null
  });

const openStages = () =>
  LeadStage.findAll({ where: { type: "open" }, order: [["position", "ASC"]] });

export const rescore = async (lead: Lead): Promise<void> => {
  const [stage, open] = await Promise.all([LeadStage.findByPk(lead.stageId), openStages()]);
  const pos = open.findIndex(s => s.id === lead.stageId);
  const score = computeScore(lead, stage, Math.max(0, pos), open.length);
  if (score !== lead.score) await lead.update({ score });
};

// Round robin among all users (or the configured subset)
export const pickOwner = async (): Promise<number | null> => {
  if ((await getSetting("crm_autoassign", "roundrobin")) === "none") return null;
  let ids: number[] = [];
  try {
    ids = JSON.parse(await getSetting("crm_owner_ids", "[]"));
  } catch (e) {
    ids = [];
  }
  const users = await User.findAll({
    where: ids.length ? { id: { [Op.in]: ids } } : {},
    attributes: ["id"],
    order: [["id", "ASC"]]
  });
  if (!users.length) return null;
  const last = Number(await getSetting("crm_rr_last", "0"));
  const next = users.find(u => u.id > last) || users[0];
  await setSetting("crm_rr_last", String(next.id));
  return next.id;
};

export interface LeadInput {
  name?: string;
  phone?: string | null;
  email?: string | null;
  city?: string;
  state?: string;
  courseId?: number | null;
  modality?: string;
  shift?: string;
  entryTerm?: string;
  educationLevel?: string;
  cpf?: string | null;
  admissionType?: string;
  entrySemester?: number;
  extraSemesters?: number;
  decisionTimeline?: string;
  motivation?: string;
  enemScore?: number | null;
  financing?: string;
  source?: string;
  channel?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  notes?: string;
  ownerId?: number | null;
  stageId?: number;
  contactId?: number | null;
  consentAt?: Date | null;
  tagIds?: number[];
  affiliateId?: number | null;
}

const FILL_FIELDS: Array<keyof LeadInput> = [
  "email", "phone", "city", "state", "courseId", "modality", "shift", "entryTerm",
  "educationLevel", "enemScore", "financing", "utmSource", "utmMedium", "utmCampaign",
  "cpf", "admissionType", "entryTerm", "decisionTimeline", "motivation"
];

// Intake periods the administrator offers; the first one is the default
export const getEntryTerms = async (): Promise<{ terms: string[]; defaultTerm: string }> => {
  const now = new Date();
  const y = now.getFullYear();
  const current = now.getMonth() < 6 ? `${y}/1` : `${y}/2`;
  const next = current.endsWith("/1") ? `${y}/2` : `${y + 1}/1`;
  const after = next.endsWith("/1") ? `${next.slice(0, 4)}/2` : `${Number(next.slice(0, 4)) + 1}/1`;
  let terms: string[] = [];
  try {
    terms = JSON.parse(await getSetting("crm_entry_terms", "[]"));
  } catch (e) {
    terms = [];
  }
  if (!terms.length) terms = [current, next, after];
  const stored = await getSetting("crm_default_entry", "");
  return { terms, defaultTerm: terms.includes(stored) ? stored : terms[0] };
};

export const findDuplicate = async (phone: string | null, email: string | null, contactId?: number | null, cpf?: string | null) => {
  const or: any[] = [];
  if (cpf) or.push({ cpf });
  if (phone) or.push({ phone });
  if (email) or.push({ email });
  if (contactId) or.push({ contactId });
  if (!or.length) return null;
  return Lead.findOne({ where: { [Op.or]: or }, order: [["id", "ASC"]] });
};

// Creates a lead, or enriches the existing one when the same person arrives again
export const upsertLead = async (
  input: LeadInput,
  actorId?: number | null
): Promise<{ lead: Lead; created: boolean }> => {
  const phone = normalizePhone(input.phone);
  const email = normalizeEmail(input.email);
  const name = (input.name || "").trim() || phone || email || "Sem nome";

  let contactId = input.contactId || null;
  if (!contactId && phone) {
    const contact = await Contact.findOne({ where: { number: phone } });
    if (contact) contactId = contact.id;
  }

  const cpf = normalizeCpf(input.cpf);
  const existing = await findDuplicate(phone, email, contactId, cpf);
  if (existing) {
    const patch: any = {};
    FILL_FIELDS.forEach(f => {
      const incoming: any = f === "phone" ? phone : f === "email" ? email : f === "cpf" ? cpf : (input as any)[f];
      if ((existing as any)[f] == null && incoming != null && incoming !== "") patch[f] = incoming;
    });
    if (!existing.contactId && contactId) patch.contactId = contactId;
    if (Object.keys(patch).length) await existing.update(patch);
    await addActivity(
      existing.id,
      actorId,
      "system",
      `Novo contato recebido${input.source ? ` via ${input.source}` : ""}${input.notes ? `: ${input.notes}` : ""}`
    );
    await rescore(existing);
    const lead = (await loadLead(existing.id)) as Lead;
    emitLead("update", lead);
    return { lead, created: false };
  }

  // people an affiliate referred start in their own column; everyone else in the first regular open column
  const lane = await affiliateStageId();
  const stage =
    (input.stageId && (await LeadStage.findByPk(input.stageId))) ||
    (input.affiliateId && (await ensureAffiliateStage())) ||
    (await LeadStage.findOne({ where: { type: "open", ...(lane ? { id: { [Op.ne]: lane } } : {}) }, order: [["position", "ASC"]] }));
  if (!stage) throw new Error("ERR_NO_LEAD_STAGES");

  const ownerId = input.ownerId === undefined ? await pickOwner() : input.ownerId;

  const created = await Lead.create({
    name,
    phone,
    email,
    city: input.city,
    state: input.state,
    courseId: input.courseId || null,
    modality: input.modality,
    entryTerm: input.entryTerm || (await getEntryTerms()).defaultTerm,
    educationLevel: input.educationLevel,
    cpf,
    admissionType: input.admissionType,
    entrySemester: input.entrySemester && input.entrySemester > 0 ? input.entrySemester : 1,
    extraSemesters: input.extraSemesters && input.extraSemesters > 0 ? Math.round(input.extraSemesters) : 0,
    decisionTimeline: input.decisionTimeline,
    motivation: input.motivation,
    enemScore: input.enemScore ?? null,
    financing: input.financing,
    source: input.source || "Outro",
    channel: input.channel,
    utmSource: input.utmSource,
    utmMedium: input.utmMedium,
    utmCampaign: input.utmCampaign,
    notes: input.notes,
    consentAt: input.consentAt || null,
    affiliateId: input.affiliateId || null,
    stageId: stage.id,
    ownerId,
    contactId
  } as any);

  if (input.tagIds?.length) await (created as any).$set("tags", input.tagIds);
  await addActivity(created.id, actorId, "system", `Lead criado${input.source ? ` via ${input.source}` : ""}`);
  if (input.affiliateId) {
    await addActivity(created.id, actorId, "system", "Indicação de afiliado: a produção dele é contada a partir desta matrícula");
    await tagAffiliateLead(created);
  }
  await rescore(created);

  const lead = (await loadLead(created.id)) as Lead;
  emitLead("create", lead);
  dispatchWebhook("lead.created", leadPayload(lead));
  return { lead, created: true };
};

export const leadPayload = (lead: Lead) => ({
  id: lead.id,
  name: lead.name,
  phone: lead.phone,
  email: lead.email,
  course: lead.course?.name,
  source: lead.source,
  stage: lead.stage?.name,
  stageType: lead.stage?.type,
  owner: lead.owner?.name,
  score: lead.score,
  lostReason: lead.lostReason,
  utmSource: lead.utmSource,
  utmCampaign: lead.utmCampaign
});

export const changeStage = async (
  leadId: number | string,
  stageId: number,
  actorId?: number | null,
  extra: { lostReason?: string; lostNote?: string } = {}
): Promise<Lead> => {
  const lead = await Lead.findByPk(leadId);
  if (!lead) throw new Error("ERR_LEAD_NOT_FOUND");
  const [from, to] = await Promise.all([LeadStage.findByPk(lead.stageId), LeadStage.findByPk(stageId)]);
  if (!to) throw new Error("ERR_STAGE_NOT_FOUND");
  if (from && from.id === to.id) return (await loadLead(lead.id)) as Lead;
  if (to.type === "lost" && !extra.lostReason) throw new Error("ERR_LOST_REASON_REQUIRED");

  const patch: any = { stageId: to.id };
  if (to.type === "won") Object.assign(patch, { wonAt: new Date(), lostAt: null, lostReason: null, lostNote: null, nextFollowUpAt: null });
  else if (to.type === "lost") Object.assign(patch, { lostAt: new Date(), wonAt: null, lostReason: extra.lostReason, lostNote: extra.lostNote || null, nextFollowUpAt: null });
  else Object.assign(patch, { wonAt: null, lostAt: null, lostReason: null, lostNote: null });
  await lead.update(patch);

  await addActivity(
    lead.id,
    actorId,
    "stage",
    `${from ? from.name : "—"} → ${to.name}${to.type === "lost" ? ` (${extra.lostReason})` : ""}`,
    { from: from?.id, to: to.id }
  );
  await rescore(lead);

  // affiliates earn on the enrolment, however the card got to "Matriculado"; undoing it cancels what was not paid
  if (lead.affiliateId) {
    const { recordBonus, cancelPendingBonus } = await import("../AffiliateServices/Bonus");
    if (to.type === "won") await recordBonus(lead.id, "enrolled").catch(() => null);
    else if (from?.type === "won") await cancelPendingBonus(lead.id).catch(() => null);
  }

  const fresh = (await loadLead(lead.id)) as Lead;
  emitLead("update", fresh);
  const payload = { ...leadPayload(fresh), from: from?.name };
  dispatchWebhook("lead.stage_changed", payload);
  if (to.type === "won") dispatchWebhook("lead.won", payload);
  if (to.type === "lost") dispatchWebhook("lead.lost", payload);
  return fresh;
};

// ------------------------------------------------ hooks used by the chat side

// One lead per contact, created the first time anyone writes to us. A per-contact
// lock keeps two simultaneous messages from creating two leads.
const creating = new Map<number, Promise<Lead | null>>();

export const ensureLead = async (contact: Contact, channel: string): Promise<Lead | null> => {
  // groups and people of the team are not candidates
  if (contact.isGroup || contact.isStaff || contact.kind === "channel") return null;
  const existing = await Lead.findOne({ where: { contactId: contact.id } });
  if (existing) return existing;
  if ((await getSetting("crm_autocreate", "true")) === "false") return null;

  const pending = creating.get(contact.id);
  if (pending) return pending;

  const job = (async () => {
    const { channelSource } = await import("./crmOptions");
    const isPhone = ["whatsapp", "whatsapp_cloud"].includes(channel);
    const { lead } = await upsertLead({
      name: contact.name,
      phone: isPhone ? contact.number : null,
      source: channelSource(channel),
      channel,
      contactId: contact.id
    });
    return lead as Lead | null;
  })().finally(() => creating.delete(contact.id));
  creating.set(contact.id, job);
  return job;
};

export const hookTicketCreated = async (contact: Contact, channel: string): Promise<void> => {
  try {
    await ensureLead(contact, channel);
  } catch (err) {
    logger.warn(`CRM auto-create failed: ${err}`);
  }
};

// Runs for every inbound message, on every channel
export const hookInbound = async (contactId: number, channel?: string): Promise<void> => {
  try {
    let lead = await Lead.findOne({ where: { contactId } });
    if (!lead) {
      const contact = await Contact.findByPk(contactId);
      if (!contact) return;
      lead = await ensureLead(contact, channel || contact.channel || "whatsapp");
      if (!lead) return;
    }
    if (lead.isHistorical) {
      // someone from the history wrote again: from now on this is a real lead, counted from this moment
      const first = (await openStages())[0];
      await lead.update({
        isHistorical: false,
        createdAt: new Date(),
        firstContactAt: null,
        slaAlertedAt: null,
        ...(first ? { stageId: first.id } : {}),
        ...(lead.ownerId ? {} : { ownerId: await pickOwner() })
      } as any);
      await addActivity(lead.id, null, "reopened", "Voltou a escrever: lead reativado a partir do histórico.");
    }
    await lead.update({ lastInboundAt: new Date(), lastContactAt: new Date() });
    await rescore(lead);
  } catch (err) {
    logger.warn(`CRM inbound hook failed: ${err}`);
  }
};

// Registers contacts that already exist (e.g. from before the CRM was enabled)
export const backfillLeads = async (): Promise<{ created: number; skipped: number }> => {
  // only people who actually have a conversation here: an imported address book is not a list of leads
  const talked = new Set(
    (await Ticket.findAll({ where: { isHistorical: false }, attributes: ["contactId"] })).map(t => t.contactId)
  );
  const contacts = (await Contact.findAll({ where: { isGroup: false }, order: [["id", "ASC"]] })).filter(c => talked.has(c.id));
  const have = new Set((await Lead.findAll({ attributes: ["contactId"] })).map(l => l.contactId));
  let created = 0;
  let skipped = 0;
  for (const c of contacts) {
    if (have.has(c.id)) {
      skipped += 1;
      continue;
    }
    try {
      // eslint-disable-next-line no-await-in-loop
      const lead = await ensureLead(c, c.channel || "whatsapp");
      if (lead) created += 1;
      else skipped += 1;
    } catch (err) {
      skipped += 1;
    }
  }
  return { created, skipped };
};

export const hookHumanReply = async (contactId: number, userId: number): Promise<void> => {
  try {
    const lead = await Lead.findOne({ where: { contactId } });
    if (!lead) return;
    const now = new Date();
    // conditional update: only the first concurrent caller "wins" first contact
    const [claimed] = await Lead.update(
      { firstContactAt: now } as any,
      { where: { id: lead.id, firstContactAt: null as any } }
    );
    const patch: any = { lastContactAt: now };
    if (!lead.ownerId) patch.ownerId = userId;
    await lead.update(patch);
    if (claimed) {
      await addActivity(lead.id, userId, "whatsapp", "Primeiro contato realizado");
      if ((await getSetting("crm_autoadvance", "true")) !== "false") {
        const open = await openStages();
        const idx = open.findIndex(s => s.id === lead.stageId);
        if (idx === 0 && open[1]) await changeStage(lead.id, open[1].id, userId);
      }
    }
    await rescore(lead);
    getIO().emit("lead", { action: "update", lead: await loadLead(lead.id) });
  } catch (err) {
    logger.warn(`CRM reply hook failed: ${err}`);
  }
};

// Which contact + connection to use when we start talking to a lead
export const resolveLeadTarget = async (
  lead: Lead,
  userId: number,
  whatsappId?: number | null
): Promise<{ contact: Contact; whatsapp: Whatsapp }> => {
  const { default: Ticket } = await import("../../models/Ticket");
  const { default: GetDefaultWhatsApp } = await import("../../helpers/GetDefaultWhatsApp");
  const { resolveOutboundContact } = await import("../ChannelServices/ResolveOutboundContact");
  const { default: AppError } = await import("../../errors/AppError");

  let whatsapp: Whatsapp | null = whatsappId ? await Whatsapp.findByPk(whatsappId) : null;
  let contact: Contact | null = lead.contactId ? await Contact.findByPk(lead.contactId) : null;

  if (contact && !whatsapp) {
    // reuse the connection of the existing conversation
    const t = await Ticket.findOne({ where: { contactId: contact.id }, order: [["updatedAt", "DESC"]] });
    if (t) whatsapp = await Whatsapp.findByPk(t.whatsappId);
  }
  if (!whatsapp) whatsapp = await GetDefaultWhatsApp(userId);

  if (!contact) {
    if (!lead.phone) throw new AppError("ERR_LEAD_NO_PHONE");
    contact = await resolveOutboundContact(whatsapp, lead.phone, lead.name);
    await lead.update({ contactId: contact.id });
  }
  return { contact, whatsapp };
};
