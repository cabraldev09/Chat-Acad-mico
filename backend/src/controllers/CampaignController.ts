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
import { assertOwnList, tutorIdOf, tutoriaConnectionId } from "../services/CampaignServices/Access";
import { assertCampaignCost, campaignCost } from "../services/CampaignServices/CostGate";
import { assertCampaignQuota, quotaOf } from "../services/CampaignServices/SendQuota";
import User from "../models/User";
import { isManagerRole, roleOf } from "../helpers/Roles";
import { CampaignStep, MAX_CAMPAIGN_STEPS, cleanSteps, stepsOf } from "../helpers/CampaignText";
import { legacyInstitutionId } from "../helpers/Institution";

// message/mediaUrl (the first step) stay filled for older screens and integrations
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
    "objective",
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
    "templateLanguage",
    "templateParams",
    "templateBody",
    "offer",
    "approach"
  ],
  required: ["name", "contactListId"],
  include: [
    { model: ContactList, as: "contactList", attributes: ["id", "name"] },
    { model: Whatsapp, as: "whatsapp", attributes: ["id", "name", "channel"] }
  ],
  authorize: async (req, row) => {
    const me = tutorIdOf(req);
    if (me && Number(row.createdById) !== me) throw new AppError("ERR_NO_PERMISSION", 403);
  },
  beforeSave: async (data, _req, existing) => {
    // who created it; the tutor sends only to their own lists, through the tutoring number
    if (!existing) data.createdById = Number(_req.user.id);
    // what the send is for: asked on every new campaign (the management follows it in Estatísticas → Disparos)
    if (data.objective !== undefined) data.objective = String(data.objective || "").replace(/\s+/g, " ").trim().slice(0, 300);
    if (!existing && !data.objective) throw new AppError("ERR_CAMPAIGN_OBJECTIVE", 400);
    if (existing && data.objective === "" && existing.objective) throw new AppError("ERR_CAMPAIGN_OBJECTIVE", 400);
    if (tutorIdOf(_req)) {
      data.whatsappId = await tutoriaConnectionId();
      await assertOwnList(_req, data.contactListId !== undefined ? data.contactListId : existing?.contactListId);
    }
    const connectionId = data.whatsappId || existing?.whatsappId;
    if (connectionId) await assertConnectionUse(_req, Number(connectionId));
    if (existing && !["draft", "scheduled", "paused"].includes(existing.status)) {
      throw new AppError("ERR_CAMPAIGN_LOCKED");
    }
    // the offer of a recovery campaign: only the management sets it, checked field by field, and it is saved only after it was reviewed
    // (the screen shows the value for each person before)
    if (data.offer !== undefined || data.approach !== undefined) {
      if (!isManagerRole(roleOf(_req.user as any))) throw new AppError("ERR_OFFER_MANAGER_ONLY", 403);
      if (data.offer === null || data.offer === "") {
        data.offer = null;
        data.approach = null;
      } else if (data.offer !== undefined) {
        const { cleanOffer, APPROACHES } = await import("../services/CampaignServices/Offer");
        try {
          data.offer = JSON.stringify(cleanOffer(typeof data.offer === "string" ? JSON.parse(data.offer) : data.offer));
        } catch (err) {
          throw new AppError(/^ERR_OFFER_/.test(String((err as Error).message)) ? (err as Error).message : "ERR_OFFER_INVALID", 400);
        }
        if (_req.body?.offerReviewed !== true) throw new AppError("ERR_OFFER_REVIEW", 400);
        const approach = data.approach !== undefined ? data.approach : existing?.approach;
        data.approach = (APPROACHES as readonly string[]).includes(approach) ? approach : "ia";
        // the proposal made by the system needs the first due date: the start of the offer
        if (data.approach === "proposta" && !JSON.parse(data.offer).startDate) throw new AppError("ERR_OFFER_START", 400);
        // a Utility template never carries the values of an offer (the Meta moves it to Marketing): the offer goes after the reply
        const tplName = data.templateName !== undefined ? data.templateName : existing?.templateName;
        const tplParams = String(data.templateParams !== undefined ? data.templateParams : existing?.templateParams || "");
        if (tplName && /oferta_/.test(tplParams)) {
          const { categoryOf } = await import("../services/CampaignServices/Templates");
          if ((await categoryOf(String(tplName))) === "UTILITY") throw new AppError("ERR_OFFER_UTILITY_VALUES", 400);
        }
      } else if (data.approach !== undefined) {
        const { APPROACHES } = await import("../services/CampaignServices/Offer");
        if (!(APPROACHES as readonly string[]).includes(data.approach)) throw new AppError("ERR_OFFER_INVALID", 400);
      }
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
        const people = await ContactListItem.count({ where: { contactListId: listId } });
        if (!people) throw new AppError("ERR_CAMPAIGN_EMPTY_LIST");
        // it starts by itself at that time: it has to fit the creator's quota of sends of the month now
        await assertCampaignQuota(existing?.createdById || Number(_req.user.id), people, _req.user as any);
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
  if (!campaigns.length) return [];
  const rows: any[] = await CampaignShipping.findAll({
    // only the campaigns listed (the history of every campaign is not counted again on each load)
    where: { campaignId: campaigns.map(c => c.id) } as any,
    attributes: ["campaignId", "status", [fn("COUNT", col("id")), "total"]],
    group: ["campaignId", "status"],
    raw: true
  });
  return campaigns.map(c => {
    const counters = { pending: 0, sending: 0, uncertain: 0, sent: 0, failed: 0, cancelled: 0, total: 0 };

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
  const me = tutorIdOf(_req);
  const campaigns = await Campaign.findAll({
    ...(me ? { where: { createdById: me } as any } : {}),
    include: [
      { model: ContactList, as: "contactList", attributes: ["id", "name"] },
      { model: Whatsapp, as: "whatsapp", attributes: ["id", "name", "channel"] }
    ],
    order: [["id", "DESC"]]
  });
  // who created each one (the management sees whose send it is)
  const ids = [...new Set(campaigns.map(c => Number(c.createdById)).filter(Boolean))];
  const names = new Map((ids.length ? await User.findAll({ where: { id: ids }, attributes: ["id", "name"] }) : []).map(u => [u.id, u.name]));
  return res.json((await withCounters(campaigns)).map((c: any) => ({ ...c, createdByName: names.get(Number(c.createdById)) || null })));
};

const SHIPPING_STATUS = ["pending", "sending", "uncertain", "sent", "failed", "cancelled"];
const STATUS_LABEL: Record<string, string> = { pending: "Pendente", sending: "Enviando", uncertain: "Conferir entrega", sent: "Enviada", failed: "Falhou", cancelled: "Cancelada" };
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
  // a Marketing template only with permission, and never past the cap of the month of the Meta
  const pending = await CampaignShipping.count({ where: { campaignId: campaign.id, status: "pending" } });
  await assertCampaignCost(campaign, await connectionOf(campaign), pending);
  // the recipients still waiting count against its creator's quota of the month from the moment it runs
  await assertCampaignQuota(campaign.createdById, pending, req.user as any);

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
  // the "check the delivery" ones may have arrived: they go back only when the person confirms (a resend can duplicate)
  const statuses = req.body?.includeUncertain === true ? ["failed", "uncertain"] : ["failed"];
  // the failed ones that go back count again against the creator's quota (a paused campaign is checked when it starts again)
  if (campaign.status !== "paused") await assertCampaignQuota(campaign.createdById, await CampaignShipping.count({ where: { campaignId: campaign.id, status: "failed" } }), req.user as any);
  const [requeued] = await CampaignShipping.update(
    { status: "pending", error: null },
    { where: { campaignId: campaign.id, status: statuses, [Op.or]: [{ error: { [Op.is]: null } }, { error: { [Op.notLike]: "%pediu para não receber%" } }] } as any }
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
    objective: c.objective,
    message: c.message,
    mediaUrl: c.mediaUrl,
    steps: c.steps,
    intervalMin: c.intervalMin,
    intervalMax: c.intervalMax,
    batchSize: c.batchSize,
    batchPause: c.batchPause,
    contactListId: c.contactListId,
    whatsappId: c.whatsappId,
    institutionId: c.institutionId || await legacyInstitutionId(),
    templateName: c.templateName,
    templateLanguage: c.templateLanguage,
    createdById: Number(req.user.id)
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
  return res.json(await preflightOf(campaign, req));
};

// the same check for a campaign still being written (the last step of the form, before saving)
const DRAFT_FIELDS = ["contactListId", "whatsappId", "message", "steps", "intervalMin", "intervalMax", "batchSize", "batchPause", "templateName", "templateLanguage", "templateBody", "templateParams"];
export const preflightDraft = async (req: Request, res: Response): Promise<Response> => {
  const body = req.body || {};
  if (!Number(body.contactListId)) throw new AppError("ERR_CAMPAIGN_LIST_REQUIRED", 400);
  await assertOwnList(req, body.contactListId);
  if (tutorIdOf(req)) body.whatsappId = await tutoriaConnectionId();
  const draft: any = Campaign.build(Object.fromEntries(DRAFT_FIELDS.filter(k => body[k] !== undefined && body[k] !== "").map(k => [k, body[k]])) as any);
  draft.intervalMin = Number(body.intervalMin) || draft.intervalMin || 20;
  draft.intervalMax = Number(body.intervalMax) || draft.intervalMax || 60;
  draft.batchSize = Number(body.batchSize) || draft.batchSize || 20;
  draft.batchPause = Number(body.batchPause) || draft.batchPause || 300;
  return res.json(await preflightOf(draft, req));
};

const preflightOf = async (campaign: Campaign, req: Request): Promise<Record<string, any>> => {
  const whatsapp = await connectionOf(campaign);

  const shipped = campaign.id ? await CampaignShipping.count({ where: { campaignId: campaign.id } }) : 0;
  const people: Array<{ number: string }> = shipped
    ? await CampaignShipping.findAll({ where: { campaignId: campaign.id, status: "pending" }, attributes: ["number"] })
    : await ContactListItem.findAll({ where: { contactListId: campaign.contactListId }, attributes: ["number"] });
  const total = people.length;

  // who we already know, and who of them ever wrote to us
  const variantsOf = people.map(p => brPhoneVariants(p.number));
  const contacts: Contact[] = [];
  for (const part of chunk([...new Set(variantsOf.flat())], 800)) {
    // eslint-disable-next-line no-await-in-loop
    contacts.push(...(await Contact.findAll({ where: { number: { [Op.in]: part } }, attributes: ["id", "number", "optOut", "consentAt"] })));
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
  // Campaign sends require recorded consent. Keep this count separate so the team can clean up the list.
  let noConsent = 0;
  let canReceive = 0;
  variantsOf.forEach(vs => {
    const c = vs.map(v => byNumber.get(v)).find(Boolean);
    if (c && c.optOut) {
      optedOut += 1;
      return;
    }
    const hasConsent = !!c?.consentAt;
    if (!hasConsent) noConsent += 1;
    const isWarm = !!c && warm.has(c.id);
    // cold contacts: only a template (official API) or a flexible QR connection may write to them
    const isColdBlocked = !isWarm && !template && !(whatsapp && isUnofficial(whatsapp) && relaxed) && (official || (whatsapp && isUnofficial(whatsapp)));
    if (isColdBlocked) cold += 1;
    if (hasConsent && !isColdBlocked) canReceive += 1;
  });

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
  if (noConsent) warnings.push(`${noConsent} ${noConsent === 1 ? "contato não tem" : "contatos não têm"} consentimento registrado e será pulado. Registre o consentimento ou tire-o da lista antes do envio.`);
  if (safety && safety.dailyLimit !== null && canReceive > Math.max(0, safety.dailyLimit - (safety.sentToday || 0))) {
    warnings.push(`Esta conexão envia até ${safety.dailyLimit} por dia em campanhas (hoje já foram ${safety.sentToday}): o envio continua nos dias seguintes.`);
  }
  // what the Meta is estimated to charge (official API with a template) and whether it fits the cap of the month
  const cost = await campaignCost(campaign, whatsapp, canReceive);
  if (cost.category === "MARKETING" && cost.categoryKnown) warnings.push(cost.marketingAllowed ? "O modelo escolhido é de Marketing: cada envio custa cerca de 9 vezes um modelo de Utilidade." : "O modelo escolhido é de Marketing (cerca de 9 vezes o preço de Utilidade) e o uso de Marketing em campanhas está desligado em Operação e custos.");
  if (!cost.fitsMonth) warnings.push("Esta campanha passaria do teto do mês do WhatsApp oficial (Operação e custos): ela não começa.");
  // the quota of sends of the month of the campaign's creator (a manager starting it has none); a running campaign already counts
  const owner = Number(campaign.createdById) || Number(req.user.id);
  const starterIsManager = isManagerRole(roleOf(req.user as any));
  const q = await quotaOf(owner, owner === Number(req.user.id) ? (req.user as any) : null);
  const adds = campaign.status === "running" ? 0 : canReceive;
  const quota = { ...q, limited: q.limited && !starterIsManager, adds, fits: !q.limited || starterIsManager || adds <= (q.left as number) };
  if (!quota.fits) warnings.push(`Esta campanha passaria da cota de disparos do mês (restam ${q.left} de ${q.quota + q.extra} mensagens). Peça liberação à gestão para enviar.`);
  return {
    total,
    canReceive,
    cost,
    quota,
    blocked: { optedOut, cold, noConsent },
    noConsent,
    messagesPerPerson,
    estimatedSeconds,
    connection: whatsapp ? { id: whatsapp.id, name: whatsapp.name, channel: whatsapp.channel, status: whatsapp.status, riskMode: whatsapp.riskMode || "strict" } : null,
    safety,
    warnings
  };
};

// ---------------------------------------------------------------- contact lists

const listCrud = makeCrud(ContactList, {
  event: "contactList",
  fields: ["name"],
  required: ["name"],
  authorize: async (req, row) => {
    const me = tutorIdOf(req);
    if (me && Number(row.createdById) !== me) throw new AppError("ERR_NO_PERMISSION", 403);
  },
  beforeSave: (data, req, existing) => (existing ? data : { ...data, createdById: Number(req.user.id) })
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
    const me = tutorIdOf(_req);
    const rows = await ContactList.findAll({
      ...(me ? { where: { createdById: me } as any } : {}),
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
  // the tutor's lists are always their own students; the management can pick the students of one tutor
  const tutor = tutorIdOf(req);
  if (tutor) { b.audience = "students"; b.tutorId = tutor; }
  // the students: enrolled and not lost; the ones who finished the onboarding, and the ones enrolled for at least N days
  const students = b.audience === "students";
  if (students && b.tutorId) and.push({ onboardingTutorId: Number(b.tutorId) });
  if (students) {
    and.push({ enrolledAt: { [Op.ne]: null } });
    if (b.onboardingDone) and.push({ onboardingStatus: "done" });
    const since = Number(b.enrolledDays);
    if (since > 0) and.push({ enrolledAt: { [Op.lt]: new Date(Date.now() - since * 24 * 3600 * 1000) } });
  }
  // the leads of "Recuperação": the ones that stopped or gave up (the reading found them, or lost in the last 90 days), by reason and
  // objection, or the ones chosen on that screen
  const recovery = b.audience === "recovery";
  if (recovery) {
    and.push({ enrolledAt: { [Op.is]: null } });
    and.push({ [Op.or]: [{ recoveryState: "aberta" }, { recoveryState: { [Op.is]: null }, lostAt: { [Op.gt]: new Date(Date.now() - 90 * 864e5) } }] });
    if (b.reason) and.push({ [Op.or]: [{ recoveryReason: String(b.reason) }, { recoveryReason: { [Op.is]: null }, lostReason: String(b.reason) }] });
    if (b.objection) and.push({ recoveryObjection: String(b.objection) });
  }
  const chosen = Array.isArray(b.leadIds) ? b.leadIds.map(Number).filter((n: number) => Number.isInteger(n) && n > 0).slice(0, 5000) : [];
  if (chosen.length) and.push({ id: { [Op.in]: chosen } });
  const quiet = Number(b.noReplyDays);
  if (quiet > 0) {
    const limit = new Date(Date.now() - quiet * 24 * 3600 * 1000);
    and.push({ [Op.or]: [{ lastContactAt: { [Op.lt]: limit } }, { lastContactAt: { [Op.is]: null } }] });
  }
  const include: any[] = [];
  // without an explicit stage, never include people already enrolled or lost (the students are the enrolled ones: only the lost stay out)
  if (!b.stageId && !recovery && !chosen.length) include.push({ model: LeadStage, as: "stage", attributes: [], where: students ? { type: { [Op.ne]: "lost" } } : { type: "open" }, required: true });
  if (b.tagId) include.push({ model: Tag, as: "tags", attributes: [], where: { id: b.tagId }, required: true, through: { attributes: [] } });

  const leads = await Lead.findAll({
    where: await withLeadScope(req, { [Op.and]: and }),
    include,
    attributes: ["id", "name", "phone", "consentAt"],
    limit: 5000
  });
  const peopleByNumber = new Map<string, { name: string; number: string; phone: string; consentAt: Date | null }>();
  leads.forEach(l => {
    const number = withCountry(l.phone || "");
    if (number.length < 10) return;
    const previous = peopleByNumber.get(number);
    if (!previous) peopleByNumber.set(number, { name: l.name, number, phone: number, consentAt: l.consentAt || null });
    else if (!previous.consentAt && l.consentAt) previous.consentAt = l.consentAt;
  });
  const people = [...peopleByNumber.values()];
  if (b.dryRun) return res.json({ count: people.length });

  let list: ContactList | null = null;
  if (b.listId) {
    list = await ContactList.findByPk(b.listId);
    if (!list) throw new AppError("ERR_NOT_FOUND", 404);
    await assertOwnList(req, list.id);
  } else {
    const name = String(b.name || "").trim();
    if (!name) throw new AppError("ERR_FIELD_REQUIRED_name");
    list = await ContactList.create({ name, createdById: Number(req.user.id) } as any);
  }
  if (!people.length) throw new AppError("ERR_CAMPAIGN_NO_LEADS");

  const consented = people.filter(p => p.consentAt);
  if (consented.length) {
    const { recordLeadCampaignConsent } = await import("../services/SafetyServices/LeadCampaignConsent");
    for (const lead of consented) {
      // eslint-disable-next-line no-await-in-loop
      await recordLeadCampaignConsent(lead);
    }
  }

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
  const consentCandidates = new Map<string, { name: string; number: string; email: string }>();
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
    if (req.body.consent === true && !consentCandidates.has(number)) {
      consentCandidates.set(number, { name: (i.name || number).trim(), number, email: i.email || "" });
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
  // A list-level consent declaration must be available to the worker too, including numbers that had no Contact row yet.
  if (consentCandidates.size) {
    const { noteConsent } = await import("../services/SafetyServices/Consent");
    for (const item of consentCandidates.values()) {
      // eslint-disable-next-line no-await-in-loop
      const variants = brPhoneVariants(item.number);
      const contact = await Contact.findOne({ where: { number: { [Op.in]: variants } } as any });
      if (contact) {
        // eslint-disable-next-line no-await-in-loop
        await noteConsent(contact.id, "import");
      } else {
        // eslint-disable-next-line no-await-in-loop
        await Contact.create({ name: item.name, number: item.number, email: item.email || "", channel: "whatsapp", consentAt: new Date(), consentSource: "import" } as any);
      }
    }
  }
  return res.json({ imported: toCreate.length, skipped, invalid, duplicated: skipped - invalid });
};

export const removeItem = async (req: Request, res: Response): Promise<Response> => {
  await ContactListItem.destroy({
    where: { id: req.params.itemId, contactListId: req.params.id }
  });
  return res.json({ message: "deleted" });
};


// the approved templates of an official number (read on the Meta), for the campaign to pick one
export const templates = async (req: Request, res: Response): Promise<Response> => {
  const whatsappId = Number(req.query.whatsappId);
  if (!whatsappId) throw new AppError("ERR_NOT_FOUND", 404);
  await assertConnectionUse(req, whatsappId);
  const { approvedTemplates, TEMPLATE_VARIABLES } = await import("../services/CampaignServices/Templates");
  return res.json({ templates: await approvedTemplates(whatsappId), variables: TEMPLATE_VARIABLES });
};

// takes out of the campaign's list the contacts without registered consent (only before the campaign starts sending)
export const removeNoConsent = async (req: Request, res: Response): Promise<Response> => {
  const campaign = await Campaign.findByPk(req.params.id);
  if (!campaign) throw new AppError("ERR_NOT_FOUND", 404);
  if (await CampaignShipping.count({ where: { campaignId: campaign.id } })) throw new AppError("ERR_CAMPAIGN_ALREADY_STARTED", 409);
  const items = await ContactListItem.findAll({ where: { contactListId: campaign.contactListId }, attributes: ["id", "number"] });
  const variants = [...new Set(items.flatMap(i => brPhoneVariants(i.number)))];
  const consented = new Set<string>();
  for (const part of chunk(variants, 800)) {
    // eslint-disable-next-line no-await-in-loop
    (await Contact.findAll({ where: { number: { [Op.in]: part }, consentAt: { [Op.ne]: null } } as any, attributes: ["number"] })).forEach(c => consented.add(c.number));
  }
  const out = items.filter(i => !brPhoneVariants(i.number).some(v => consented.has(v))).map(i => i.id);
  if (out.length) await ContactListItem.destroy({ where: { id: { [Op.in]: out } } as any });
  return res.json({ removed: out.length });
};

// THE OFFER PERSON BY PERSON: what each one of the list would receive (the scholarship over the price of their course), before the send
export const offerPreview = async (req: Request, res: Response): Promise<Response> => {
  const { cleanOffer, offerFor } = await import("../services/CampaignServices/Offer");
  let offer;
  try {
    offer = cleanOffer(req.body?.offer);
  } catch (err) {
    throw new AppError(/^ERR_OFFER_/.test(String((err as Error).message)) ? (err as Error).message : "ERR_OFFER_INVALID", 400);
  }
  const listId = Number(req.body?.contactListId);
  if (!listId) throw new AppError("ERR_FIELD_REQUIRED_contactListId", 400);
  const items = await ContactListItem.findAll({ where: { contactListId: listId }, attributes: ["name", "number"], limit: 2000 });
  const Course = (await import("../models/Course")).default;
  const rows: Array<{ name: string; course: string | null; monthly: string; fee: string }> = [];
  let noPrice = 0;
  for (const it of items) {
    // eslint-disable-next-line no-await-in-loop
    const lead = await Lead.findOne({ where: { phone: { [Op.in]: brPhoneVariants(it.number) } } as any, attributes: ["courseId"], order: [["updatedAt", "DESC"]] });
    // eslint-disable-next-line no-await-in-loop
    const course = lead?.courseId ? await Course.findByPk(lead.courseId, { attributes: ["name", "monthlyFee"] }) : null;
    const v = offerFor(offer, course ? Number((course as any).monthlyFee) || null : null);
    if (!v.text.oferta_mensalidade) noPrice += 1;
    if (rows.length < 50) rows.push({ name: it.name, course: course ? (course as any).name : null, monthly: v.text.oferta_mensalidade || "o consultor informa", fee: v.text.oferta_taxa });
  }
  return res.json({ total: items.length, noPrice, rows, validUntil: offer.validUntil, startDate: offer.startDate });
};
