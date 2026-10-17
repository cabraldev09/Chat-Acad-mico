import { publicFile } from "../helpers/PublicFile";
import { assertConnectionUse } from "../middleware/outboundScope";
import { Request, Response } from "express";
import { fn, col, Op, QueryTypes } from "sequelize";

import sequelize from "../database";
import { portable } from "../helpers/sqlDialect";
import { brPhoneVariants } from "../helpers/PhoneVariants";
import { csvAsText, csvDay, sendCsv } from "../helpers/Csv";
import Contact from "../models/Contact";
import { ensureShippings, describeShippingError } from "../services/CampaignServices/Shippings";
import { deliverStep, usesTemplate } from "../services/CampaignServices/Deliver";
import { getSafetyStatus, isUnofficial } from "../services/SafetyServices/SendGuard";

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
import { CampaignStep, MAX_CAMPAIGN_STEPS, stepsOf } from "../helpers/CampaignText";

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
    // a blank number field is "not informed" (the default applies), never an empty text in a number column
    const whole = (field: string, min: number, max: number) => {
      if (data[field] === undefined) return;
      if (data[field] === "" || data[field] === null || Number.isNaN(Number(data[field]))) {
        delete data[field];
        return;
      }
      data[field] = Math.min(max, Math.max(min, Math.round(Number(data[field]))));
    };
    whole("intervalMin", 0, 3600);
    whole("intervalMax", 0, 3600);
    whole("batchSize", 1, 1000);
    whole("batchPause", 0, 86400);
    const lo = data.intervalMin !== undefined ? data.intervalMin : existing?.intervalMin;
    const hi = data.intervalMax !== undefined ? data.intervalMax : existing?.intervalMax;
    if (lo !== undefined && hi !== undefined && Number(lo) > Number(hi)) {
      throw new AppError("ERR_CAMPAIGN_INTERVAL");
    }

    // Saving with a start date schedules the campaign (it starts by itself at that time). Without one it stays a draft.
    const status = existing?.status || "draft";
    if (data.scheduledAt) {
      const at = new Date(data.scheduledAt).getTime();
      if (Number.isNaN(at)) throw new AppError("ERR_INVALID_PARAMETER");
      const changed = !existing || !existing.scheduledAt || new Date(existing.scheduledAt).getTime() !== at;
      if (changed && at < Date.now() - 60000) throw new AppError("ERR_CAMPAIGN_SCHEDULE_PAST");
      if (["draft", "scheduled"].includes(status) && at > Date.now()) {
        const listId = data.contactListId !== undefined ? data.contactListId : existing?.contactListId;
        if (!(await ContactListItem.count({ where: { contactListId: listId } }))) throw new AppError("ERR_CAMPAIGN_EMPTY_LIST");
        data.status = "scheduled";
      }
    } else if (data.scheduledAt === null && status === "scheduled") {
      data.status = "draft";
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
    const counters = { pending: 0, sent: 0, failed: 0, cancelled: 0, total: 0 };
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

const SHIPPING_STATUS = ["pending", "sent", "failed", "cancelled"];
const STATUS_LABEL: Record<string, string> = { pending: "Pendente", sent: "Enviada", failed: "Falhou", cancelled: "Cancelada" };
const REPORT_LIMIT = 5000;

// JSON for the screen; `format=csv` is the spreadsheet. `status` narrows the list (the counters stay whole).
export const report = async (req: Request, res: Response): Promise<Response> => {
  const campaign = await Campaign.findByPk(req.params.id);
  if (!campaign) throw new AppError("ERR_NOT_FOUND", 404);
  const only = SHIPPING_STATUS.includes(String(req.query.status)) ? String(req.query.status) : null;
  const csv = req.query.format === "csv";
  const shippings = await CampaignShipping.findAll({
    where: { campaignId: campaign.id, ...(only ? { status: only } : {}) },
    order: [["id", "ASC"]],
    limit: csv ? 100000 : REPORT_LIMIT
  });
  if (csv) {
    const steps = stepsOf(campaign).length;
    return sendCsv(res, `campanha-${campaign.id}-${campaign.name}.csv`, ["Nome", "WhatsApp", "Situação", "Mensagens enviadas", "Enviada em", "Motivo da falha"],
      shippings.map(sh => [sh.name || "", csvAsText(sh.number), STATUS_LABEL[sh.status] || sh.status, `${sh.stepsDone || 0} de ${steps}`, csvDay(sh.sentAt), describeShippingError(sh.error)]));
  }
  const [withCount] = await withCounters([campaign]);
  return res.json({
    campaign: withCount,
    truncated: withCount.counters.total > REPORT_LIMIT && !only,
    shippings: shippings.map(sh => ({ ...sh.toJSON(), errorText: describeShippingError(sh.error) }))
  });
};

const setStatus = async (id: string, status: string, allowedFrom: string[]) => {
  const campaign = await Campaign.findByPk(id);
  if (!campaign) throw new AppError("ERR_NOT_FOUND", 404);
  if (!allowedFrom.includes(campaign.status)) {
    throw new AppError("ERR_CAMPAIGN_INVALID_STATE");
  }
  return { campaign, apply: (extra = {}) => campaign.update({ status, ...extra }) };
};

// `now: true` starts at once even when a start date was set (the date is dropped); without it a campaign with a future date
// waits for that date.
export const start = async (req: Request, res: Response): Promise<Response> => {
  const { campaign, apply } = await setStatus(req.params.id, "running", [
    "draft",
    "paused",
    "scheduled"
  ]);

  if (campaign.whatsappId) await assertConnectionUse(req, campaign.whatsappId);

  // the recipients are copied from the list the first time the campaign starts
  await ensureShippings(campaign);

  const now = req.body?.now === true || req.body?.now === "true";
  const future = !now && campaign.scheduledAt && campaign.scheduledAt.getTime() > Date.now();
  const updated = future
    ? await apply({ status: "scheduled" })
    : await apply({ startedAt: campaign.startedAt || new Date(), pauseReason: null, ...(now ? { scheduledAt: null } : {}) });
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

// The ones that failed go back to the queue (a multi-message sequence continues from the message that failed; the people who
// asked not to receive anything stay out). A finished campaign starts running again.
export const retryFailed = async (req: Request, res: Response): Promise<Response> => {
  const campaign = await Campaign.findByPk(req.params.id);
  if (!campaign) throw new AppError("ERR_NOT_FOUND", 404);
  if (!["running", "paused", "finished"].includes(campaign.status)) throw new AppError("ERR_CAMPAIGN_INVALID_STATE");
  if (campaign.whatsappId) await assertConnectionUse(req, campaign.whatsappId);
  const [requeued] = await CampaignShipping.update(
    { status: "pending", error: null },
    { where: { campaignId: campaign.id, status: "failed", [Op.or]: [{ error: { [Op.is]: null } }, { error: { [Op.notLike]: "%pediu para não receber%" } }] } as any }
  );
  if (!requeued) throw new AppError("ERR_CAMPAIGN_NOTHING_TO_RETRY");
  // a person whose every message already went out starts the last one again (never past the end of the sequence)
  const last = Math.max(0, stepsOf(campaign).length - 1);
  await CampaignShipping.update({ stepsDone: last }, { where: { campaignId: campaign.id, status: "pending", stepsDone: { [Op.gt]: last } } });
  const updated = await campaign.update(campaign.status === "finished" ? { status: "running", finishedAt: null, pauseReason: null } : {});
  getIO().emit("campaign", { action: "update", row: updated });
  return res.json({ requeued, campaign: updated });
};

export const duplicate = async (req: Request, res: Response): Promise<Response> => {
  const c = await Campaign.findByPk(req.params.id);
  if (!c) throw new AppError("ERR_NOT_FOUND", 404);
  const copy = await Campaign.create({
    name: `${c.name} (cópia)`.slice(0, 250),
    message: c.message,
    mediaUrl: c.mediaUrl,
    steps: c.steps,
    intervalMin: c.intervalMin,
    intervalMax: c.intervalMax,
    batchSize: c.batchSize,
    batchPause: c.batchPause,
    contactListId: c.contactListId,
    whatsappId: c.whatsappId,
    templateName: c.templateName,
    templateLanguage: c.templateLanguage
  } as any);
  getIO().emit("campaign", { action: "create", row: copy });
  return res.status(201).json(copy);
};

const connectionOf = async (campaign: Campaign): Promise<Whatsapp | null> =>
  campaign.whatsappId ? Whatsapp.findByPk(campaign.whatsappId) : Whatsapp.findOne({ where: { isDefault: true } });

// Sends the campaign's messages to one number (the person's own, to see how it looks) through the campaign's connection.
export const sendTest = async (req: Request, res: Response): Promise<Response> => {
  const campaign = await Campaign.findByPk(req.params.id);
  if (!campaign) throw new AppError("ERR_NOT_FOUND", 404);
  const digits = String(req.body?.number || "").replace(/\D/g, "");
  const number = digits.length === 10 || digits.length === 11 ? `55${digits}` : digits;
  if (number.length < 10) throw new AppError("ERR_CAMPAIGN_TEST_NUMBER");
  const whatsapp = await connectionOf(campaign);
  if (!whatsapp || whatsapp.status !== "CONNECTED") throw new AppError("ERR_CAMPAIGN_CONNECTION_DOWN");
  await assertConnectionUse(req, whatsapp.id);
  const steps = usesTemplate(campaign, whatsapp) ? stepsOf(campaign).slice(0, 1) : stepsOf(campaign);
  const name = String(req.body?.name || "Teste").trim().slice(0, 60) || "Teste";
  for (let index = 0; index < steps.length; index += 1) {
    // eslint-disable-next-line no-await-in-loop
    await deliverStep({ campaign, whatsapp, number, name, step: steps[index], index });
    // eslint-disable-next-line no-await-in-loop
    if (index + 1 < steps.length) await new Promise(r => setTimeout(r, 3000));
  }
  return res.json({ ok: true, sent: steps.length });
};

const chunk = <T>(list: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
};

// What would happen if the campaign started now: how many of the people can receive it through the chosen connection and
// why the others cannot, how long it takes, and what is wrong with the connection. Nothing is sent or changed.
export const preflight = async (req: Request, res: Response): Promise<Response> => {
  const campaign = await Campaign.findByPk(req.params.id);
  if (!campaign) throw new AppError("ERR_NOT_FOUND", 404);
  const whatsapp = await connectionOf(campaign);

  const shipped = await CampaignShipping.count({ where: { campaignId: campaign.id } });
  const people: Array<{ number: string }> = shipped
    ? await CampaignShipping.findAll({ where: { campaignId: campaign.id, status: "pending" }, attributes: ["number"] })
    : await ContactListItem.findAll({ where: { contactListId: campaign.contactListId }, attributes: ["number"] });
  const total = people.length;

  // who we already know, and who of them ever wrote to us
  const variantsOf = people.map(p => brPhoneVariants(p.number));
  const contacts: Contact[] = [];
  for (const part of chunk([...new Set(variantsOf.flat())], 800)) {
    // eslint-disable-next-line no-await-in-loop
    contacts.push(...(await Contact.findAll({ where: { number: { [Op.in]: part } }, attributes: ["id", "number", "optOut"] })));
  }
  const warm = new Set<number>();
  for (const part of chunk(contacts.map(c => c.id), 800)) {
    // eslint-disable-next-line no-await-in-loop
    const rows = (await sequelize.query(
      portable("SELECT DISTINCT t.contactId AS id FROM Tickets t JOIN Messages m ON m.ticketId = t.id WHERE m.fromMe = false AND t.contactId IN (:ids)"),
      { replacements: { ids: part }, type: QueryTypes.SELECT }
    )) as Array<{ id: number }>;
    rows.forEach(r => warm.add(Number(r.id)));
  }
  const byNumber = new Map<string, Contact>(contacts.map(c => [c.number, c]));

  const official = !!whatsapp && whatsapp.channel === "whatsapp_cloud";
  const template = !!whatsapp && usesTemplate(campaign, whatsapp);
  const relaxed = !!whatsapp && whatsapp.riskMode === "relaxed";
  let optedOut = 0;
  let cold = 0;
  variantsOf.forEach(vs => {
    const c = vs.map(v => byNumber.get(v)).find(Boolean);
    if (c && c.optOut) {
      optedOut += 1;
      return;
    }
    const isWarm = !!c && warm.has(c.id);
    // cold contacts: only a template (official API) or a flexible QR connection may write to them
    if (!isWarm && !template && !(whatsapp && isUnofficial(whatsapp) && relaxed) && (official || (whatsapp && isUnofficial(whatsapp)))) cold += 1;
  });
  const canReceive = Math.max(0, total - optedOut - cold);

  const steps = stepsOf(campaign);
  const messagesPerPerson = template ? 1 : steps.length;
  const avgInterval = (campaign.intervalMin + campaign.intervalMax) / 2;
  const stepWaits = steps.slice(1, messagesPerPerson).reduce((t, st) => t + Math.max(3, st.delaySec || 0), 0);
  const estimatedSeconds = Math.round(canReceive * (avgInterval + stepWaits) + Math.floor(canReceive / Math.max(1, campaign.batchSize)) * campaign.batchPause);

  const safety = whatsapp && isUnofficial(whatsapp) ? await getSafetyStatus(whatsapp) : null;
  const warnings: string[] = [];
  if (!total) warnings.push("A lista de contatos está vazia.");
  if (!whatsapp) warnings.push("Não há conexão padrão. Escolha uma conexão na campanha.");
  else if (whatsapp.status !== "CONNECTED") warnings.push(`A conexão “${whatsapp.name}” não está conectada agora: a campanha fica aguardando até ela voltar.`);
  if (optedOut) warnings.push(`${optedOut} ${optedOut === 1 ? "pessoa pediu" : "pessoas pediram"} para não receber mensagens e ${optedOut === 1 ? "será pulada" : "serão puladas"}.`);
  if (cold) {
    warnings.push(
      official
        ? `${cold} ${cold === 1 ? "contato nunca respondeu" : "contatos nunca responderam"}: na API oficial eles só recebem por um modelo aprovado. Informe o modelo na campanha.`
        : `${cold} ${cold === 1 ? "contato nunca respondeu" : "contatos nunca responderam"} e esta conexão está em modo seguro: ${cold === 1 ? "ele será pulado" : "eles serão pulados"}. Para escrever a quem nunca respondeu, use a API oficial com um modelo ou o modo flexível (com mais risco para o número).`
    );
  }
  if (safety && safety.dailyLimit !== null && canReceive > Math.max(0, safety.dailyLimit - (safety.sentToday || 0))) {
    warnings.push(`Esta conexão envia até ${safety.dailyLimit} por dia em campanhas (hoje já foram ${safety.sentToday}): o envio continua nos dias seguintes.`);
  }
  return res.json({
    total,
    canReceive,
    blocked: { optedOut, cold },
    messagesPerPerson,
    estimatedSeconds,
    connection: whatsapp ? { id: whatsapp.id, name: whatsapp.name, channel: whatsapp.channel, status: whatsapp.status, riskMode: whatsapp.riskMode || "strict" } : null,
    safety,
    warnings
  });
};

// ---------------------------------------------------------------- contact lists

const listCrud = makeCrud(ContactList, {
  event: "contactList",
  fields: ["name"],
  required: ["name"]
});

export const lists = {
  ...listCrud,
  // a list used by a campaign is not deleted: the campaigns (and their reports) would go with it
  remove: async (req: Request, res: Response): Promise<Response> => {
    const used = await Campaign.count({ where: { contactListId: req.params.id } });
    if (used) throw new AppError("ERR_CAMPAIGN_LIST_IN_USE", 400, { campaigns: used });
    return listCrud.remove(req, res);
  },
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

export const exportListCsv = async (req: Request, res: Response): Promise<Response> => {
  const list = await ContactList.findByPk(req.params.id);
  if (!list) throw new AppError("ERR_NOT_FOUND", 404);
  const items = await ContactListItem.findAll({ where: { contactListId: list.id }, order: [["id", "ASC"]] });
  return sendCsv(res, `lista-${list.name}.csv`, ["Nome", "WhatsApp", "E-mail"], items.map(i => [i.name || "", csvAsText(i.number), i.email || ""]));
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
  let invalid = 0;
  incoming.forEach(i => {
    // a number typed without the country code gets 55, like the lists made from the CRM
    const number = withCountry(i.number || "");
    if (number.length < 10) {
      invalid += 1;
      skipped += 1;
      return;
    }
    if (brPhoneVariants(number).some(v => existing.has(v))) {
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
  return res.json({ imported: toCreate.length, skipped, invalid, duplicated: skipped - invalid });
};

export const removeItem = async (req: Request, res: Response): Promise<Response> => {
  await ContactListItem.destroy({
    where: { id: req.params.itemId, contactListId: req.params.id }
  });
  return res.json({ message: "deleted" });
};
