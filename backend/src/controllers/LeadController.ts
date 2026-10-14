import { Request, Response } from "express";
import { getBusinessConfig, normalizeBusiness, resetBusinessCache, businessMinutes } from "../helpers/BusinessTime";
import { dayBounds, shiftDays } from "../helpers/AppTime";
import { withLeadScope, isAdminReq, reqRole } from "../middleware/scope";
import { portable, nowSql, nowMinus, diffMinutes, diffHours, dayOf, countIf } from "../helpers/sqlDialect";
import { Op } from "sequelize";
import { randomBytes } from "crypto";

import Lead from "../models/Lead";
import LeadStage from "../models/LeadStage";
import LeadActivity from "../models/LeadActivity";
import LeadTask from "../models/LeadTask";
import Institution from "../models/Institution";
import Course from "../models/Course";
import User from "../models/User";
import Ticket from "../models/Ticket";
import Contact from "../models/Contact";
import AppError from "../errors/AppError";
import GetDefaultWhatsApp from "../helpers/GetDefaultWhatsApp";
import Whatsapp from "../models/Whatsapp";
import { getIO } from "../libs/socket";
import { getSetting, setSetting } from "../helpers/AppSettings";
import { normalizeEmail, normalizePhone } from "../helpers/Phone";
import { isValidCpf, normalizeCpf } from "../helpers/Cpf";
import FindOrCreateTicketService from "../services/TicketServices/FindOrCreateTicketService";
import UpdateTicketService from "../services/TicketServices/UpdateTicketService";
import { resolveOutboundContact } from "../services/ChannelServices/ResolveOutboundContact";
import { CRM_OPTIONS } from "../services/CrmServices/crmOptions";
import {
  addActivity,
  changeStage,
  getEntryTerms,
  leadInclude,
  loadLead,
  rescore,
  resolveLeadTarget,
  upsertLead
} from "../services/CrmServices/LeadCore";
import dispatchWebhook from "../services/WebhookServices/DispatchWebhook";
import makeCrud from "./crudFactory";

const uid = (req: Request) => Number(req.user.id);

// ------------------------------------------------------------------ filters
const buildWhere = (q: any) => {
  // history (leads from conversations that predate the connection) is hidden unless asked for
  const where: any = q.historical === "1" ? {} : { isHistorical: false };
  if (q.stageId) where.stageId = q.stageId;
  if (q.ownerId === "none") where.ownerId = { [Op.is]: null };
  else if (q.ownerId) where.ownerId = q.ownerId;
  if (q.courseId) where.courseId = q.courseId;
  if (q.source) where.source = q.source;
  if (q.search) {
    const s = `%${String(q.search).trim()}%`;
    const digits = String(q.search).replace(/\D/g, "");
    where[Op.or] = [
      { name: { [Op.like]: s } },
      { email: { [Op.like]: s } },
      ...(digits.length >= 4 ? [{ phone: { [Op.like]: `%${digits}%` } }] : [])
    ];
  }
  if (q.followUp === "overdue") where.nextFollowUpAt = { [Op.lt]: new Date() };
  if (q.followUp === "today") {
    const { start, end } = dayBounds();
    where.nextFollowUpAt = { [Op.between]: [start, end] };
  }
  return where;
};

const withTag = (tagId?: string) =>
  tagId
    ? (leadInclude as any[]).map(i =>
        i.as === "tags" ? { ...i, required: true, where: { id: tagId } } : i
      )
    : (leadInclude as any[]);

export const index = async (req: Request, res: Response): Promise<Response> => {
  const limit = Math.min(Number(req.query.limit) || 50, 500);
  const offset = Number(req.query.offset) || 0;
  const { rows, count } = await Lead.findAndCountAll({
    where: await withLeadScope(req, buildWhere(req.query)),
    include: withTag(req.query.tagId as string),
    order: [["updatedAt", "DESC"]],
    limit,
    offset,
    distinct: true
  });
  return res.json({ leads: rows, count, hasMore: count > offset + rows.length });
};

export const board = async (req: Request, res: Response): Promise<Response> => {
  const stages = await LeadStage.findAll({ order: [["position", "ASC"]] });
  const where = await withLeadScope(req, buildWhere({ ...req.query, stageId: undefined }));
  const include = withTag(req.query.tagId as string);
  const perStage = Math.min(Number(req.query.perStage) || 30, 100);

  const out = await Promise.all(
    stages.map(async stage => {
      const { rows, count } = await Lead.findAndCountAll({
        where: { [Op.and]: [where, { stageId: stage.id }] },
        include,
        order: [
          ["score", "DESC"],
          ["updatedAt", "DESC"]
        ],
        limit: perStage,
        distinct: true
      });
      return { ...stage.toJSON(), count, leads: rows };
    })
  );
  return res.json({ stages: out });
};

export const show = async (req: Request, res: Response): Promise<Response> => {
  const lead = await loadLead(req.params.id);
  if (!lead) throw new AppError("ERR_LEAD_NOT_FOUND", 404);
  // the CPF is hidden from every list; only the detail view returns it
  return res.json({ ...lead.toJSON(), cpf: lead.cpf });
};

const FIELDS = [
  "name", "phone", "email", "city", "state", "courseId", "modality", "entryTerm",
  "educationLevel", "enemScore", "financing", "source", "utmSource", "utmMedium", "utmCampaign",
  "notes", "ownerId", "nextFollowUpAt", "cpf", "admissionType", "entrySemester", "extraSemesters",
  "decisionTimeline", "motivation"
];

export const store = async (req: Request, res: Response): Promise<Response> => {
  const b = req.body;
  if (!b.name || !String(b.name).trim()) throw new AppError("ERR_FIELD_REQUIRED_name");
  if (!normalizePhone(b.phone) && !normalizeEmail(b.email)) {
    throw new AppError("ERR_LEAD_NEEDS_PHONE_OR_EMAIL");
  }
  if (b.cpf && !isValidCpf(b.cpf)) throw new AppError("ERR_CPF_INVALID");
  const { lead, created } = await upsertLead(
    {
      ...b,
      source: b.source || "Outro",
      // a consultant's own new lead is theirs unless they say otherwise
      ownerId: b.ownerId === undefined ? (reqRole(req) === "consultor" ? uid(req) : undefined) : b.ownerId || null
    },
    uid(req)
  );
  return res.status(created ? 201 : 200).json({ lead, created });
};

export const update = async (req: Request, res: Response): Promise<Response> => {
  const lead = await Lead.findByPk(req.params.id);
  if (!lead) throw new AppError("ERR_LEAD_NOT_FOUND", 404);
  const patch: any = {};
  FIELDS.forEach(f => {
    if (req.body[f] !== undefined) patch[f] = req.body[f] === "" ? null : req.body[f];
  });
  if (patch.cpf !== undefined) {
    if (patch.cpf !== null && !isValidCpf(patch.cpf)) throw new AppError("ERR_CPF_INVALID");
    patch.cpf = normalizeCpf(patch.cpf);
    if (patch.cpf) {
      const other = await Lead.findOne({ where: { cpf: patch.cpf, id: { [Op.ne]: lead.id } } });
      if (other) throw new AppError("ERR_CPF_ALREADY_USED");
    }
  }
  if (patch.entrySemester !== undefined) patch.entrySemester = Math.max(1, Number(patch.entrySemester) || 1);
  if (patch.extraSemesters !== undefined) patch.extraSemesters = Math.min(10, Math.max(0, Math.round(Number(patch.extraSemesters) || 0)));
  if (patch.phone !== undefined) patch.phone = normalizePhone(patch.phone);
  if (patch.email !== undefined) patch.email = normalizeEmail(patch.email);
  if (patch.name === null) throw new AppError("ERR_FIELD_REQUIRED_name");

  const ownerChanged = patch.ownerId !== undefined && patch.ownerId !== lead.ownerId;
  await lead.update(patch);
  if (Array.isArray(req.body.tagIds)) await (lead as any).$set("tags", req.body.tagIds.map(Number));
  if (ownerChanged) {
    const owner = patch.ownerId ? await User.findByPk(patch.ownerId) : null;
    await addActivity(lead.id, uid(req), "system", owner ? `Responsável: ${owner.name}` : "Responsável removido");
  }
  await rescore(lead);
  const fresh = (await loadLead(lead.id)) as Lead;
  getIO().emit("lead", { action: "update", lead: fresh });
  dispatchWebhook("lead.updated", { id: fresh.id, name: fresh.name, stage: fresh.stage?.name });
  return res.json(fresh);
};

export const remove = async (req: Request, res: Response): Promise<Response> => {
  const lead = await Lead.findByPk(req.params.id);
  if (!lead) throw new AppError("ERR_LEAD_NOT_FOUND", 404);
  await lead.destroy();
  getIO().emit("lead", { action: "delete", leadId: Number(req.params.id) });
  return res.json({ message: "deleted" });
};

export const setStage = async (req: Request, res: Response): Promise<Response> => {
  const { stageId, lostReason, lostNote } = req.body;
  try {
    const lead = await changeStage(req.params.id, Number(stageId), uid(req), { lostReason, lostNote });
    return res.json(lead);
  } catch (err) {
    throw new AppError(err.message || "ERR_STAGE_CHANGE");
  }
};

// -------------------------------------------------------------- timeline/tasks
export const activities = async (req: Request, res: Response): Promise<Response> =>
  res.json(
    await LeadActivity.findAll({
      where: { leadId: req.params.id },
      include: [{ model: User, as: "user", attributes: ["id", "name"] }],
      order: [["createdAt", "DESC"]],
      limit: 200
    })
  );

export const addNote = async (req: Request, res: Response): Promise<Response> => {
  const { type = "note", body } = req.body;
  if (!body || !String(body).trim()) throw new AppError("ERR_FIELD_REQUIRED_body");
  if (!["note", "call", "whatsapp", "email", "visit"].includes(type)) throw new AppError("ERR_INVALID_TYPE");
  const lead = await Lead.findByPk(req.params.id);
  if (!lead) throw new AppError("ERR_LEAD_NOT_FOUND", 404);
  const a = await addActivity(lead.id, uid(req), type, body);
  const patch: any = { lastContactAt: new Date() };
  if (!lead.firstContactAt && type !== "note") patch.firstContactAt = new Date();
  await lead.update(patch);
  await rescore(lead);
  getIO().emit("lead", { action: "update", lead: await loadLead(lead.id) });
  return res.status(201).json(a);
};

const syncNextFollowUp = async (leadId: number) => {
  const next = await LeadTask.findOne({
    where: { leadId, doneAt: null as any },
    order: [["dueAt", "ASC"]]
  });
  await Lead.update({ nextFollowUpAt: next ? next.dueAt : null }, { where: { id: leadId } });
  const lead = await loadLead(leadId);
  if (lead) getIO().emit("lead", { action: "update", lead });
};

export const leadTasks = async (req: Request, res: Response): Promise<Response> =>
  res.json(
    await LeadTask.findAll({
      where: { leadId: req.params.id },
      include: [{ model: User, as: "user", attributes: ["id", "name"] }],
      order: [["dueAt", "ASC"]]
    })
  );

export const addTask = async (req: Request, res: Response): Promise<Response> => {
  const { title, type = "ligar", dueAt, userId } = req.body;
  if (!title || !dueAt) throw new AppError("ERR_FIELD_REQUIRED_title_dueAt");
  const due = new Date(dueAt);
  if (Number.isNaN(due.getTime())) throw new AppError("ERR_INVALID_DATE");
  const lead = await Lead.findByPk(req.params.id);
  if (!lead) throw new AppError("ERR_LEAD_NOT_FOUND", 404);
  const task = await LeadTask.create({
    leadId: lead.id,
    title,
    type,
    dueAt: due,
    userId: userId || lead.ownerId || uid(req)
  } as any);
  await addActivity(lead.id, uid(req), "task", `Tarefa criada: ${title}`);
  await syncNextFollowUp(lead.id);
  return res.status(201).json(task);
};

export const updateTask = async (req: Request, res: Response): Promise<Response> => {
  const task = await LeadTask.findByPk(req.params.taskId);
  if (!task) throw new AppError("ERR_NOT_FOUND", 404);
  const { title, dueAt, type, userId } = req.body;
  await task.update({
    ...(title ? { title } : {}),
    ...(type ? { type } : {}),
    ...(userId ? { userId } : {}),
    ...(dueAt ? { dueAt: new Date(dueAt), notifiedAt: null } : {})
  });
  await syncNextFollowUp(task.leadId);
  return res.json(task);
};

export const completeTask = async (req: Request, res: Response): Promise<Response> => {
  const task = await LeadTask.findByPk(req.params.taskId);
  if (!task) throw new AppError("ERR_NOT_FOUND", 404);
  await task.update({ doneAt: task.doneAt ? null : new Date() });
  if (task.doneAt) await addActivity(task.leadId, uid(req), "task", `Tarefa concluída: ${task.title}`);
  await syncNextFollowUp(task.leadId);
  return res.json(task);
};

export const removeTask = async (req: Request, res: Response): Promise<Response> => {
  const task = await LeadTask.findByPk(req.params.taskId);
  if (!task) throw new AppError("ERR_NOT_FOUND", 404);
  await task.destroy();
  await syncNextFollowUp(task.leadId);
  return res.json({ message: "deleted" });
};

export const tasksIndex = async (req: Request, res: Response): Promise<Response> => {
  const { scope = "mine", status = "open" } = req.query as any;
  const where: any = {};
  if (scope === "mine" || !isAdminReq(req)) where.userId = uid(req);
  const now = new Date();
  const { start, end } = dayBounds();
  if (status === "done") where.doneAt = { [Op.not]: null };
  else where.doneAt = { [Op.is]: null };
  if (status === "overdue") where.dueAt = { [Op.lt]: now };
  if (status === "today") where.dueAt = { [Op.between]: [start, end] };
  const rows = await LeadTask.findAll({
    where,
    include: [
      { model: Lead, as: "lead", attributes: ["id", "name", "phone", "stageId"], include: [{ model: LeadStage, as: "stage", attributes: ["name", "color"] }] },
      { model: User, as: "user", attributes: ["id", "name"] }
    ],
    order: [["dueAt", "ASC"]],
    limit: 300
  });
  return res.json(rows);
};

// ------------------------------------------------------------ chat bridge
export const byContact = async (req: Request, res: Response): Promise<Response> => {
  const lead = await Lead.findOne({
    where: await withLeadScope(req, { contactId: req.params.contactId }),
    include: leadInclude as any
  });
  return res.json(lead || null);
};

export const fromContact = async (req: Request, res: Response): Promise<Response> => {
  const contact = await Contact.findByPk(req.params.contactId);
  if (!contact) throw new AppError("ERR_NO_CONTACT_FOUND", 404);
  const { channelSource } = await import("../services/CrmServices/crmOptions");
  const whatsapp = req.body.whatsappId ? await Whatsapp.findByPk(req.body.whatsappId) : null;
  const channel = whatsapp?.channel || contact.channel || "whatsapp";
  const isPhone = ["whatsapp", "whatsapp_cloud"].includes(channel);
  const { lead, created } = await upsertLead(
    {
      name: contact.name,
      phone: isPhone ? contact.number : null,
      email: contact.email,
      source: channelSource(channel),
      channel,
      contactId: contact.id,
      ownerId: uid(req)
    },
    uid(req)
  );
  return res.status(created ? 201 : 200).json(lead);
};

export const openTicket = async (req: Request, res: Response): Promise<Response> => {
  const lead = await Lead.findByPk(req.params.id);
  if (!lead) throw new AppError("ERR_LEAD_NOT_FOUND", 404);
  const { contact, whatsapp } = await resolveLeadTarget(lead, uid(req), req.body.whatsappId);

  const ticket = await FindOrCreateTicketService(contact, whatsapp.id, 0);
  if (ticket.status === "pending" || ticket.status === "closed") {
    await UpdateTicketService({ ticketData: { status: "open", userId: uid(req) }, ticketId: ticket.id });
  }
  return res.json({ ticketId: ticket.id });
};

// ------------------------------------------------------------------ import
export const importLeads = async (req: Request, res: Response): Promise<Response> => {
  const items: any[] = Array.isArray(req.body.items) ? req.body.items.slice(0, 5000) : [];
  const courses = await Course.findAll();
  const byName = new Map(courses.map(c => [c.name.toLowerCase(), c.id]));
  let created = 0;
  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];
  for (const [i, it] of items.entries()) {
    if (!normalizePhone(it.phone) && !normalizeEmail(it.email)) {
      skipped += 1;
      errors.push(`Linha ${i + 1}: sem telefone/e-mail válido`);
      continue;
    }
    try {
      // eslint-disable-next-line no-await-in-loop
      const r = await upsertLead(
        {
          name: it.name,
          phone: it.phone,
          email: it.email,
          city: it.city,
          state: it.state,
          courseId: it.course ? byName.get(String(it.course).toLowerCase()) || null : null,
          notes: it.course && !byName.has(String(it.course).toLowerCase()) ? `Curso de interesse: ${it.course}` : it.notes,
          modality: it.modality,
          entryTerm: it.entryTerm,
          admissionType: it.admissionType,
          source: it.source || req.body.source || "Importação",
          ownerId: req.body.ownerId || undefined
        },
        uid(req)
      );
      if (r.created) created += 1;
      else updated += 1;
    } catch (e) {
      skipped += 1;
      errors.push(`Linha ${i + 1}: ${e.message}`);
    }
  }
  return res.json({ created, updated, skipped, errors: errors.slice(0, 20) });
};

// ------------------------------------------------------- stages / courses / opts
const stageCrud = makeCrud(LeadStage, {
  event: "leadStage",
  fields: ["name", "color", "type", "position"],
  required: ["name", "color"],
  order: [["position", "ASC"]],
  beforeSave: data => {
    if (data.type && !["open", "won", "lost"].includes(data.type)) throw new AppError("ERR_INVALID_STAGE_TYPE");
    return data;
  }
});
export const stages = {
  ...stageCrud,
  remove: async (req: Request, res: Response): Promise<Response> => {
    const inUse = await Lead.count({ where: { stageId: req.params.id } });
    if (inUse) throw new AppError("ERR_STAGE_HAS_LEADS");
    return stageCrud.remove(req, res);
  }
};

export const courses = makeCrud(Course, {
  event: "course",
  fields: ["name", "level", "modality", "category", "semesters", "institutionId", "monthlyFee", "active"],
  required: ["name"],
  order: [["name", "ASC"]],
  beforeSave: data => {
    if (data.monthlyFee === "" || data.monthlyFee === undefined) data.monthlyFee = null;
    if (data.institutionId === "" || data.institutionId === 0) data.institutionId = null;
    return data;
  }
});

export const backfill = async (_req: Request, res: Response): Promise<Response> => {
  const { backfillLeads } = await import("../services/CrmServices/LeadCore");
  return res.json(await backfillLeads());
};

const yes = (v: any, fallback = true): boolean => {
  if (v === undefined || v === null || String(v).trim() === "") return fallback;
  return !["0", "nao", "não", "n", "false", "inativo", "no"].includes(String(v).trim().toLowerCase());
};

const MODALITIES = ["Presencial", "EAD", "Semipresencial"];
const normalizeModality = (v: any): string | null => {
  const t = String(v || "").trim();
  if (!t) return null;
  const hit = MODALITIES.find(m => m.toLowerCase() === t.toLowerCase().replace("semi presencial", "semipresencial"));
  if (hit) return hit;
  if (/semi/i.test(t)) return "Semipresencial";
  if (/dist|ead|online/i.test(t)) return "EAD";
  if (/presen/i.test(t)) return "Presencial";
  return t;
};

// body: { items: [{ name, category, level, modality, monthlyFee, semesters, active, institution }], institutionId, dryRun }
// Returns one row per line (new | update | error) so the wizard can show a preview.
export const importCourses = async (req: Request, res: Response): Promise<Response> => {
  const items: any[] = Array.isArray(req.body.items) ? req.body.items.slice(0, 3000) : [];
  const dryRun = Boolean(req.body.dryRun);
  const institutions = await Institution.findAll();
  const rows: any[] = [];
  let created = 0;
  let updated = 0;
  for (const [i, it] of items.entries()) {
    const line = i + 1;
    const name = String(it.name || "").trim();
    if (!name) { rows.push({ line, status: "error", error: "Falta o nome do curso", name: "" }); continue; }
    const rawFee = it.monthlyFee === undefined || it.monthlyFee === "" || it.monthlyFee === null ? null : it.monthlyFee;
    const fee =
      rawFee === null
        ? null
        : typeof rawFee === "number"
        ? rawFee
        : Number(String(rawFee).replace(/[^\d.,-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."));
    if (fee !== null && (Number.isNaN(fee) || fee < 0)) { rows.push({ line, status: "error", error: "Mensalidade inválida", name }); continue; }
    const semesters = it.semesters === undefined || it.semesters === "" ? 8 : Number(it.semesters);
    if (!Number.isInteger(semesters) || semesters < 1 || semesters > 20) { rows.push({ line, status: "error", error: "Semestres deve ser um número de 1 a 20", name }); continue; }
    let institutionId = req.body.institutionId ? Number(req.body.institutionId) : null;
    if (it.institution) {
      const inst = institutions.find(x => x.name.toLowerCase() === String(it.institution).trim().toLowerCase());
      if (!inst) { rows.push({ line, status: "error", error: `Instituição "${it.institution}" não cadastrada`, name }); continue; }
      institutionId = inst.id;
    }
    const data: any = {
      name, category: String(it.category || "").trim() || null, level: String(it.level || "").trim() || null,
      modality: normalizeModality(it.modality), monthlyFee: fee, semesters, institutionId, active: yes(it.active)
    };
    // eslint-disable-next-line no-await-in-loop
    const existing = await Course.findOne({ where: { name, category: data.category, modality: data.modality } });
    if (!dryRun) {
      // eslint-disable-next-line no-await-in-loop
      if (existing) await existing.update(data);
      // eslint-disable-next-line no-await-in-loop
      else await Course.create(data);
    }
    if (existing) updated += 1; else created += 1;
    rows.push({ line, status: existing ? "update" : "new", ...data });
  }
  return res.json({ created, updated, errors: rows.filter(r => r.status === "error").length, rows, dryRun });
};

export const options = async (_req: Request, res: Response): Promise<Response> => {
  const { terms, defaultTerm } = await getEntryTerms();
  return res.json({ ...CRM_OPTIONS, entryTerms: terms, defaultEntryTerm: defaultTerm });
};

export const getSettings = async (_req: Request, res: Response): Promise<Response> =>
  res.json({
    autoassign: await getSetting("crm_autoassign", "roundrobin"),
    autocreate: (await getSetting("crm_autocreate", "true")) !== "false",
    autoadvance: (await getSetting("crm_autoadvance", "true")) !== "false",
    ownerIds: JSON.parse(await getSetting("crm_owner_ids", "[]")),
    entryTerms: (await getEntryTerms()).terms,
    defaultEntryTerm: (await getEntryTerms()).defaultTerm,
    formToken: await getSetting("crm_form_token", ""),
    formTitle: await getSetting("crm_form_title", "Quero conhecer a instituição"),
    formThanks: await getSetting("crm_form_thanks", "Recebemos seus dados! Em breve um consultor entra em contato."),
    formColor: await getSetting("crm_form_color", "#0B4279"),
    slaMinutes: Number(await getSetting("crm_sla_minutes", "15")),
    businessHours: await getBusinessConfig()
  });

export const putSettings = async (req: Request, res: Response): Promise<Response> => {
  const b = req.body;
  if (b.autoassign !== undefined) await setSetting("crm_autoassign", b.autoassign === "none" ? "none" : "roundrobin");
  if (b.autocreate !== undefined) await setSetting("crm_autocreate", b.autocreate ? "true" : "false");
  if (b.autoadvance !== undefined) await setSetting("crm_autoadvance", b.autoadvance ? "true" : "false");
  if (Array.isArray(b.entryTerms)) {
    const terms = b.entryTerms.map((t: any) => String(t).trim()).filter((t: string) => /^20\d{2}\/[12]$/.test(t));
    await setSetting("crm_entry_terms", JSON.stringify(terms));
  }
  if (typeof b.defaultEntryTerm === "string") await setSetting("crm_default_entry", b.defaultEntryTerm);
  if (Array.isArray(b.ownerIds)) await setSetting("crm_owner_ids", JSON.stringify(b.ownerIds.map(Number)));
  if (typeof b.formTitle === "string") await setSetting("crm_form_title", b.formTitle.slice(0, 120));
  if (typeof b.formThanks === "string") await setSetting("crm_form_thanks", b.formThanks.slice(0, 300));
  if (typeof b.formColor === "string" && /^#[0-9a-f]{6}$/i.test(b.formColor)) await setSetting("crm_form_color", b.formColor);
  if (b.slaMinutes !== undefined) await setSetting("crm_sla_minutes", String(Math.max(0, Math.min(1440, Math.round(Number(b.slaMinutes) || 0)))));
  if (b.businessHours) {
    await setSetting("business_hours", JSON.stringify(normalizeBusiness(b.businessHours)));
    resetBusinessCache();
  }
  if (b.regenerateFormToken || !(await getSetting("crm_form_token", ""))) {
    await setSetting("crm_form_token", randomBytes(16).toString("hex"));
  }
  return getSettings(req, res);
};

// ------------------------------------------------------------------ metrics
export const metrics = async (req: Request, res: Response): Promise<Response> => {
  const sequelize = (await import("../database")).default;
  const { QueryTypes } = await import("sequelize");
  const to = dayBounds(req.query.to ? String(req.query.to) : undefined).end;
  const from = req.query.from ? dayBounds(String(req.query.from)).start : dayBounds(shiftDays(new Date(), -29)).start;
  // consultants only ever see their own numbers
  const ownerId = reqRole(req) === "consultor" ? Number(req.user.id) : req.query.ownerId ? Number(req.query.ownerId) : null;
  const courseId = req.query.courseId ? Number(req.query.courseId) : null;
  const rep = { from, to, ownerId, courseId };
  const f = `AND l.isHistorical = false AND (:ownerId IS NULL OR l.ownerId = :ownerId) AND (:courseId IS NULL OR l.courseId = :courseId)`;
  const q = async (sql: string): Promise<any[]> =>
    (await sequelize.query(portable(sql), { replacements: rep, type: QueryTypes.SELECT })) as any[];

  const [kpi] = await q(`
    SELECT COUNT(*) AS leads,
      ${countIf("s.type='won'")} AS won, ${countIf("s.type='lost'")} AS lost, ${countIf("s.type='open'")} AS open,
      AVG(CASE WHEN l.firstContactAt IS NOT NULL THEN ${diffMinutes('l.createdAt', 'l.firstContactAt')} END) AS avgFirstContactMin,
      AVG(CASE WHEN l.wonAt IS NOT NULL THEN ${diffHours('l.createdAt', 'l.wonAt')}/24 END) AS avgDaysToEnroll,
      ${countIf("s.type='open' AND l.ownerId IS NULL")} AS unassigned
    FROM Leads l JOIN LeadStages s ON s.id = l.stageId
    WHERE l.createdAt BETWEEN :from AND :to ${f}`);

  // time to the first contact counts only working hours (plain elapsed time when none are configured)
  const business = await getBusinessConfig();
  const contacted = await q(`
    SELECT l.createdAt AS c, l.firstContactAt AS f, l.ownerId AS o FROM Leads l
    WHERE l.firstContactAt IS NOT NULL AND l.createdAt BETWEEN :from AND :to ${f} LIMIT 20000`);
  const sums: Record<string, { s: number; n: number }> = {};
  let allSum = 0;
  contacted.forEach(r => {
    const m = businessMinutes(business, new Date(r.c), new Date(r.f));
    allSum += m;
    const k = String(r.o ?? "none");
    sums[k] = { s: (sums[k]?.s || 0) + m, n: (sums[k]?.n || 0) + 1 };
  });
  const avgAll = contacted.length ? allSum / contacted.length : null;

  const funnel = await q(`
    SELECT s.id, s.name, s.color, s.type, s.position, COUNT(l.id) AS total
    FROM LeadStages s
    LEFT JOIN Leads l ON l.stageId = s.id AND l.createdAt BETWEEN :from AND :to ${f}
    GROUP BY s.id, s.name, s.color, s.type, s.position ORDER BY s.position`);

  const bySource = await q(`
    SELECT COALESCE(l.source,'Outro') AS name, COUNT(*) AS leads, ${countIf("s.type='won'")} AS won
    FROM Leads l JOIN LeadStages s ON s.id = l.stageId
    WHERE l.createdAt BETWEEN :from AND :to ${f} GROUP BY l.source ORDER BY leads DESC`);

  const byCourse = await q(`
    SELECT COALESCE(c.name,'Sem curso') AS name, COUNT(*) AS leads, ${countIf("s.type='won'")} AS won
    FROM Leads l JOIN LeadStages s ON s.id = l.stageId LEFT JOIN Courses c ON c.id = l.courseId
    WHERE l.createdAt BETWEEN :from AND :to ${f} GROUP BY c.id, c.name ORDER BY leads DESC LIMIT 12`);

  const byOwner = await q(`
    SELECT COALESCE(u.name,'Sem responsável') AS name, u.id AS ownerId, COUNT(*) AS leads, ${countIf("s.type='won'")} AS won,
      ${countIf("s.type='open'")} AS open,
      AVG(CASE WHEN l.firstContactAt IS NOT NULL THEN ${diffMinutes('l.createdAt', 'l.firstContactAt')} END) AS avgFirstContactMin
    FROM Leads l JOIN LeadStages s ON s.id = l.stageId LEFT JOIN Users u ON u.id = l.ownerId
    WHERE l.createdAt BETWEEN :from AND :to ${f} GROUP BY u.id, u.name ORDER BY won DESC, leads DESC`);

  const lostReasons = await q(`
    SELECT COALESCE(l.lostReason,'Não informado') AS name, COUNT(*) AS total
    FROM Leads l JOIN LeadStages s ON s.id = l.stageId
    WHERE s.type='lost' AND l.createdAt BETWEEN :from AND :to ${f} GROUP BY l.lostReason ORDER BY total DESC`);

  const created = await q(`
    SELECT ${dayOf('l.createdAt')} AS day, COUNT(*) AS total FROM Leads l
    WHERE l.createdAt BETWEEN :from AND :to ${f} GROUP BY ${dayOf('l.createdAt')} ORDER BY day`);
  const wonDaily = await q(`
    SELECT ${dayOf('l.wonAt')} AS day, COUNT(*) AS total FROM Leads l
    WHERE l.wonAt BETWEEN :from AND :to ${f} GROUP BY ${dayOf('l.wonAt')} ORDER BY day`);

  const [attention] = await q(`
    SELECT
      (SELECT COUNT(*) FROM LeadTasks t JOIN Leads l ON l.id = t.leadId WHERE t.doneAt IS NULL AND t.dueAt < ${nowSql()} ${f}) AS overdueTasks,
      (SELECT COUNT(*) FROM Leads l JOIN LeadStages s ON s.id = l.stageId
         WHERE s.type='open' AND COALESCE(l.lastContactAt, l.createdAt) < ${nowMinus(3, 'DAY')} ${f}) AS stale,
      (SELECT COUNT(*) FROM Leads l JOIN LeadStages s ON s.id = l.stageId
         WHERE s.type='open' AND l.firstContactAt IS NULL AND l.createdAt < ${nowMinus(1, 'HOUR')} ${f}) AS waitingFirstContact`);

  const num = (v: any) => (v === null || v === undefined ? null : Number(v));
  return res.json({
    range: { from, to },
    kpi: {
      leads: Number(kpi.leads) || 0,
      won: Number(kpi.won) || 0,
      lost: Number(kpi.lost) || 0,
      open: Number(kpi.open) || 0,
      conversion: Number(kpi.leads) ? (Number(kpi.won) / Number(kpi.leads)) * 100 : 0,
      avgFirstContactMin: avgAll,
      businessHours: business.enabled,
      avgDaysToEnroll: num(kpi.avgDaysToEnroll),
      unassigned: Number(kpi.unassigned) || 0
    },
    funnel: funnel.map(r => ({ ...r, total: Number(r.total) })),
    bySource: bySource.map(r => ({ ...r, leads: Number(r.leads), won: Number(r.won) })),
    byCourse: byCourse.map(r => ({ ...r, leads: Number(r.leads), won: Number(r.won) })),
    byOwner: byOwner.map(r => {
      const k = sums[String(r.ownerId ?? "none")];
      return { ...r, leads: Number(r.leads), won: Number(r.won), open: Number(r.open), avgFirstContactMin: k ? k.s / k.n : null };
    }),
    lostReasons: lostReasons.map(r => ({ ...r, total: Number(r.total) })),
    created: created.map(r => ({ day: r.day, total: Number(r.total) })),
    wonDaily: wonDaily.map(r => ({ day: r.day, total: Number(r.total) })),
    attention: {
      overdueTasks: Number(attention.overdueTasks) || 0,
      stale: Number(attention.stale) || 0,
      waitingFirstContact: Number(attention.waitingFirstContact) || 0
    }
  });
};

// ---------------------------------------------------------- enrollment -> tutor
export const enroll = async (req: Request, res: Response): Promise<Response> => {
  const lead = await Lead.findByPk(req.params.id);
  if (!lead) throw new AppError("ERR_LEAD_NOT_FOUND", 404);
  if (!req.body.poloId) throw new AppError("ERR_FIELD_REQUIRED_poloId");
  const { default: enrollLead } = await import("../services/CrmServices/EnrollLead");
  return res.json(
    await enrollLead(lead, uid(req), {
      poloId: Number(req.body.poloId),
      tutorId: req.body.tutorId,
      note: req.body.note,
      fee: req.body.fee,
      feeDueDate: req.body.feeDueDate,
      introMessage: req.body.introMessage,
      whatsappId: req.body.whatsappId ? Number(req.body.whatsappId) : null
    })
  );
};

export const onboarding = async (req: Request, res: Response): Promise<Response> => {
  const lead = await Lead.findByPk(req.params.id);
  if (!lead) throw new AppError("ERR_LEAD_NOT_FOUND", 404);
  const action = req.body.action === "done" ? "done" : "start";
  const { setOnboarding } = await import("../services/CrmServices/EnrollLead");
  return res.json(await setOnboarding(lead, uid(req), action));
};

export const onboardingList = async (req: Request, res: Response): Promise<Response> => {
  const rows = await Lead.findAll({
    where: await withLeadScope(req, { onboardingStatus: { [Op.ne]: "none" } }),
    include: leadInclude as any,
    order: [["enrolledAt", "DESC"]],
    limit: 300
  });
  // tutor names and the onboarding conversation, so the board needs no extra calls
  const tutorIds = [...new Set(rows.map(r => r.onboardingTutorId).filter(Boolean))];
  const tutors = tutorIds.length ? await User.findAll({ where: { id: tutorIds }, attributes: ["id", "name"] }) : [];
  const contactIds = rows.map(r => r.contactId).filter(Boolean);
  const tickets = contactIds.length
    ? await Ticket.findAll({ where: { contactId: contactIds, segment: "onboarding" }, attributes: ["id", "contactId", "status"], order: [["id", "DESC"]] })
    : [];
  return res.json(
    rows.map(r => ({
      ...r.toJSON(),
      tutorName: tutors.find(t => t.id === r.onboardingTutorId)?.name || null,
      ticketId: tickets.find(t => t.contactId === r.contactId)?.id || null
    }))
  );
};
