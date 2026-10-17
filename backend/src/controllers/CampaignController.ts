import { publicFile } from "../helpers/PublicFile";
import { assertConnectionUse } from "../middleware/outboundScope";
import { Request, Response } from "express";
import { fn, col, Op } from "sequelize";

import Campaign from "../models/Campaign";
import CampaignShipping from "../models/CampaignShipping";
import ContactList from "../models/ContactList";
import ContactListItem from "../models/ContactListItem";
import Whatsapp from "../models/Whatsapp";
import Lead from "../models/Lead";
import LeadStage from "../models/LeadStage";
import Tag from "../models/Tag";
import { withLeadScope } from "../middleware/scope";
import AppError from "../errors/AppError";
import { getIO } from "../libs/socket";
import makeCrud from "./crudFactory";
import { CampaignStep, MAX_CAMPAIGN_STEPS } from "../helpers/CampaignText";

// message/mediaUrl (the first step) stay filled for older screens and integrations
const cleanSteps = (raw: any): CampaignStep[] => {
  if (!Array.isArray(raw)) throw new AppError("ERR_CAMPAIGN_NO_MESSAGE");
  if (raw.length > MAX_CAMPAIGN_STEPS) throw new AppError("ERR_CAMPAIGN_TOO_MANY_STEPS");
  const out = raw.map((s: any) => {
    const body = String(s?.body || "").trim().slice(0, 4000);
    const mediaUrl = s?.mediaUrl ? String(s.mediaUrl) : null;
    if (mediaUrl) publicFile(mediaUrl);
    if (!body && !mediaUrl) throw new AppError("ERR_CAMPAIGN_STEP_EMPTY");
    const delaySec = Math.min(600, Math.max(0, Math.round(Number(s?.delaySec) || 0)));
    return { type: mediaUrl ? "media" : "text", body, mediaUrl, delaySec } as CampaignStep;
  });
  if (!out.length) throw new AppError("ERR_CAMPAIGN_NO_MESSAGE");
  return out;
};

const applySteps = async (data: any, existing?: Campaign) => {
  if (data.steps === undefined && data.message !== undefined && !existing) {
    // legacy payload: a single message
    data.steps = [{ body: data.message, mediaUrl: data.mediaUrl || null, delaySec: 0 }];
  }
  if (data.steps === undefined) {
    if (!existing) throw new AppError("ERR_CAMPAIGN_NO_MESSAGE");
    return;
  }
  const steps = cleanSteps(data.steps);
  data.steps = steps;
  data.message = steps[0].body;
  data.mediaUrl = steps[0].mediaUrl;

  // an approved template opens the conversation; free text after it only works once the person answered
  const whatsappId = data.whatsappId !== undefined ? data.whatsappId : existing?.whatsappId;
  const templateName = data.templateName !== undefined ? data.templateName : existing?.templateName;
  if (steps.length > 1 && whatsappId && templateName) {
    const w = await Whatsapp.findByPk(whatsappId);
    if (w?.channel === "whatsapp_cloud") throw new AppError("ERR_CAMPAIGN_STEPS_TEMPLATE");
  }
};

const crud = makeCrud(Campaign, {
  event: "campaign",
  fields: [
    "name",
    "message",
    "mediaUrl",
    "steps",
    "scheduledAt",
    "intervalMin",
    "intervalMax",
    "batchSize",
    "batchPause",
    "contactListId",
    "whatsappId",
    "templateName",
    "templateLanguage"
  ],
  required: ["name", "contactListId"],
  include: [
    { model: ContactList, as: "contactList", attributes: ["id", "name"] },
    { model: Whatsapp, as: "whatsapp", attributes: ["id", "name", "channel"] }
  ],
  beforeSave: async (data, _req, existing) => {
    const connectionId = data.whatsappId || existing?.whatsappId;
    if (connectionId) await assertConnectionUse(_req, Number(connectionId));
    if (existing && !["draft", "scheduled", "paused"].includes(existing.status)) {
      throw new AppError("ERR_CAMPAIGN_LOCKED");
    }
    await applySteps(data, existing);
    if (data.whatsappId === "" || data.whatsappId === 0) data.whatsappId = null;
    if (data.scheduledAt === "") data.scheduledAt = null;
    if (data.intervalMin !== undefined && data.intervalMax !== undefined) {
      if (Number(data.intervalMin) > Number(data.intervalMax)) {
        throw new AppError("ERR_CAMPAIGN_INTERVAL");
      }
    }
    return data;
  }
});

export const { show, store, update, remove } = crud;

const withCounters = async (campaigns: Campaign[]) => {
  const rows: any[] = await CampaignShipping.findAll({
    attributes: ["campaignId", "status", [fn("COUNT", col("id")), "total"]],
    group: ["campaignId", "status"],
    raw: true
  });
  return campaigns.map(c => {
    const counters = { pending: 0, sent: 0, failed: 0, total: 0 };
    rows
      .filter(r => r.campaignId === c.id)
      .forEach(r => {
        (counters as any)[r.status] = Number(r.total);
        counters.total += Number(r.total);
      });
    return { ...c.toJSON(), counters };
  });
};

export const index = async (_req: Request, res: Response): Promise<Response> => {
  const campaigns = await Campaign.findAll({
    include: [
      { model: ContactList, as: "contactList", attributes: ["id", "name"] },
      { model: Whatsapp, as: "whatsapp", attributes: ["id", "name", "channel"] }
    ],
    order: [["id", "DESC"]]
  });
  return res.json(await withCounters(campaigns));
};

export const report = async (req: Request, res: Response): Promise<Response> => {
  const campaign = await Campaign.findByPk(req.params.id);
  if (!campaign) throw new AppError("ERR_NOT_FOUND", 404);
  const shippings = await CampaignShipping.findAll({
    where: { campaignId: campaign.id },
    order: [["id", "ASC"]]
  });
  const [withCount] = await withCounters([campaign]);
  return res.json({ campaign: withCount, shippings });
};

const setStatus = async (id: string, status: string, allowedFrom: string[]) => {
  const campaign = await Campaign.findByPk(id);
  if (!campaign) throw new AppError("ERR_NOT_FOUND", 404);
  if (!allowedFrom.includes(campaign.status)) {
    throw new AppError("ERR_CAMPAIGN_INVALID_STATE");
  }
  return { campaign, apply: (extra = {}) => campaign.update({ status, ...extra }) };
};

export const start = async (req: Request, res: Response): Promise<Response> => {
  const { campaign, apply } = await setStatus(req.params.id, "running", [
    "draft",
    "paused",
    "scheduled"
  ]);

  if (campaign.whatsappId) await assertConnectionUse(req, campaign.whatsappId);

  // (re)build the shipping list the first time the campaign starts
  const existing = await CampaignShipping.count({ where: { campaignId: campaign.id } });
  if (!existing) {
    const items = await ContactListItem.findAll({
      where: { contactListId: campaign.contactListId }
    });
    if (!items.length) throw new AppError("ERR_CAMPAIGN_EMPTY_LIST");
    await CampaignShipping.bulkCreate(
      items.map(i => ({
        campaignId: campaign.id,
        name: i.name,
        number: i.number,
        status: "pending"
      }))
    );
  }

  const future = campaign.scheduledAt && campaign.scheduledAt.getTime() > Date.now();
  const updated = future
    ? await apply({ status: "scheduled" })
    : await apply({ startedAt: campaign.startedAt || new Date(), pauseReason: null });
  getIO().emit("campaign", { action: "update", row: updated });
  return res.json(updated);
};

export const pause = async (req: Request, res: Response): Promise<Response> => {
  const { apply } = await setStatus(req.params.id, "paused", ["running", "scheduled"]);
  const updated = await apply();
  getIO().emit("campaign", { action: "update", row: updated });
  return res.json(updated);
};

export const cancel = async (req: Request, res: Response): Promise<Response> => {
  const { campaign, apply } = await setStatus(req.params.id, "cancelled", [
    "running",
    "paused",
    "scheduled",
    "draft"
  ]);
  await CampaignShipping.update(
    { status: "cancelled" },
    { where: { campaignId: campaign.id, status: "pending" } }
  );
  const updated = await apply({ finishedAt: new Date() });
  getIO().emit("campaign", { action: "update", row: updated });
  return res.json(updated);
};

// ---------------------------------------------------------------- contact lists

const listCrud = makeCrud(ContactList, {
  event: "contactList",
  fields: ["name"],
  required: ["name"]
});

export const lists = {
  ...listCrud,
  index: async (_req: Request, res: Response): Promise<Response> => {
    const rows = await ContactList.findAll({
      attributes: ["id", "name", "createdAt", [fn("COUNT", col("items.id")), "itemCount"]],
      include: [{ model: ContactListItem, as: "items", attributes: [] }],
      group: ["ContactList.id"],
      order: [["id", "DESC"]],
      raw: true
    });
    return res.json(rows);
  }
};

export const listItems = async (req: Request, res: Response): Promise<Response> => {
  const items = await ContactListItem.findAll({
    where: { contactListId: req.params.id },
    order: [["id", "ASC"]]
  });
  return res.json(items);
};

const normalizeNumber = (n: string) => String(n || "").replace(/\D/g, "");

// Brazilian numbers typed without the country code get 55
const withCountry = (n: string) => {
  const d = normalizeNumber(n);
  return d.length === 10 || d.length === 11 ? `55${d}` : d;
};

// Builds (or fills) a contact list from the CRM funnel. `dryRun` only counts, so the screen
// can show "N pessoas" before anything is created. Honors the signed-in user's lead scope.
export const listFromLeads = async (req: Request, res: Response): Promise<Response> => {
  const b = req.body || {};
  const and: any[] = [{ phone: { [Op.ne]: null } }];
  if (b.stageId) and.push({ stageId: b.stageId });
  if (b.courseId) and.push({ courseId: b.courseId });
  if (b.poloId) and.push({ poloId: b.poloId });
  if (b.source) and.push({ source: b.source });
  if (b.ownerId) and.push({ ownerId: b.ownerId });
  // the students: enrolled and not lost; the ones who finished the onboarding, and the ones enrolled for at least N days
  const students = b.audience === "students";
  if (students) {
    and.push({ enrolledAt: { [Op.ne]: null } });
    if (b.onboardingDone) and.push({ onboardingStatus: "done" });
    const since = Number(b.enrolledDays);
    if (since > 0) and.push({ enrolledAt: { [Op.lt]: new Date(Date.now() - since * 24 * 3600 * 1000) } });
  }
  const quiet = Number(b.noReplyDays);
  if (quiet > 0) {
    const limit = new Date(Date.now() - quiet * 24 * 3600 * 1000);
    and.push({ [Op.or]: [{ lastContactAt: { [Op.lt]: limit } }, { lastContactAt: { [Op.is]: null } }] });
  }
  const include: any[] = [];
  // without an explicit stage, never include people already enrolled or lost (the students are the enrolled ones: only the lost stay out)
  if (!b.stageId) include.push({ model: LeadStage, as: "stage", attributes: [], where: students ? { type: { [Op.ne]: "lost" } } : { type: "open" }, required: true });
  if (b.tagId) include.push({ model: Tag, as: "tags", attributes: [], where: { id: b.tagId }, required: true, through: { attributes: [] } });

  const leads = await Lead.findAll({
    where: await withLeadScope(req, { [Op.and]: and }),
    include,
    attributes: ["id", "name", "phone"],
    limit: 5000
  });
  const seen = new Set<string>();
  const people: Array<{ name: string; number: string }> = [];
  leads.forEach(l => {
    const number = withCountry(l.phone || "");
    if (number.length < 10 || seen.has(number)) return;
    seen.add(number);
    people.push({ name: l.name, number });
  });
  if (b.dryRun) return res.json({ count: people.length });

  let list: ContactList | null = null;
  if (b.listId) {
    list = await ContactList.findByPk(b.listId);
    if (!list) throw new AppError("ERR_NOT_FOUND", 404);
  } else {
    const name = String(b.name || "").trim();
    if (!name) throw new AppError("ERR_FIELD_REQUIRED_name");
    list = await ContactList.create({ name });
  }
  if (!people.length) throw new AppError("ERR_CAMPAIGN_NO_LEADS");

  const existing = new Set(
    (await ContactListItem.findAll({ where: { contactListId: list.id }, attributes: ["number"] })).map(i => i.number)
  );
  const fresh = people.filter(p => !existing.has(p.number));
  await ContactListItem.bulkCreate(fresh.map(p => ({ contactListId: list!.id, name: p.name, number: p.number })));
  getIO().emit("contactList", { action: "update", row: list });
  return res.json({ id: list.id, name: list.name, imported: fresh.length, skipped: people.length - fresh.length });
};

export const importItems = async (req: Request, res: Response): Promise<Response> => {
  const list = await ContactList.findByPk(req.params.id);
  if (!list) throw new AppError("ERR_NOT_FOUND", 404);
  const incoming: Array<{ name?: string; number?: string; email?: string }> =
    req.body.items || [];

  const existing = new Set(
    (await ContactListItem.findAll({ where: { contactListId: list.id }, attributes: ["number"] })).map(
      i => i.number
    )
  );
  const toCreate: any[] = [];
  let skipped = 0;
  incoming.forEach(i => {
    const number = normalizeNumber(i.number || "");
    if (number.length < 8 || existing.has(number)) {
      skipped += 1;
      return;
    }
    existing.add(number);
    toCreate.push({
      contactListId: list.id,
      name: (i.name || number).trim(),
      number,
      email: i.email || null
    });
  });
  await ContactListItem.bulkCreate(toCreate);
  return res.json({ imported: toCreate.length, skipped });
};

export const removeItem = async (req: Request, res: Response): Promise<Response> => {
  await ContactListItem.destroy({
    where: { id: req.params.itemId, contactListId: req.params.id }
  });
  return res.json({ message: "deleted" });
};
