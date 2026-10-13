import { Request, Response } from "express";
import { Op } from "sequelize";
import { randomBytes } from "crypto";

import Lead from "../models/Lead";
import LeadStage from "../models/LeadStage";
import LeadActivity from "../models/LeadActivity";
import LeadTask from "../models/LeadTask";
import Course from "../models/Course";
import User from "../models/User";
import Contact from "../models/Contact";
import AppError from "../errors/AppError";
import GetDefaultWhatsApp from "../helpers/GetDefaultWhatsApp";
import Whatsapp from "../models/Whatsapp";
import { getIO } from "../libs/socket";
import { getSetting, setSetting } from "../helpers/AppSettings";
import { normalizeEmail, normalizePhone } from "../helpers/Phone";
import FindOrCreateTicketService from "../services/TicketServices/FindOrCreateTicketService";
import UpdateTicketService from "../services/TicketServices/UpdateTicketService";
import { resolveOutboundContact } from "../services/ChannelServices/ResolveOutboundContact";
import { CRM_OPTIONS } from "../services/CrmServices/crmOptions";
import {
  addActivity,
  changeStage,
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
  const where: any = {};
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
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const end = new Date(); end.setHours(23, 59, 59, 999);
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
    where: buildWhere(req.query),
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
  const where = buildWhere({ ...req.query, stageId: undefined });
  const include = withTag(req.query.tagId as string);
  const perStage = Math.min(Number(req.query.perStage) || 30, 100);

  const out = await Promise.all(
    stages.map(async stage => {
      const { rows, count } = await Lead.findAndCountAll({
        where: { ...where, stageId: stage.id },
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
  return res.json(lead);
};

const FIELDS = [
  "name", "phone", "email", "city", "state", "courseId", "modality", "shift", "entryTerm",
  "educationLevel", "enemScore", "financing", "source", "utmSource", "utmMedium", "utmCampaign",
  "notes", "ownerId", "nextFollowUpAt"
];

export const store = async (req: Request, res: Response): Promise<Response> => {
  const b = req.body;
  if (!b.name || !String(b.name).trim()) throw new AppError("ERR_FIELD_REQUIRED_name");
  if (!normalizePhone(b.phone) && !normalizeEmail(b.email)) {
    throw new AppError("ERR_LEAD_NEEDS_PHONE_OR_EMAIL");
  }
  const { lead, created } = await upsertLead(
    { ...b, source: b.source || "Outro", ownerId: b.ownerId === undefined ? undefined : b.ownerId || null },
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
  if (scope === "mine") where.userId = uid(req);
  const now = new Date();
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const end = new Date(); end.setHours(23, 59, 59, 999);
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
  const lead = await Lead.findOne({ where: { contactId: req.params.contactId }, include: leadInclude as any });
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
          shift: it.shift,
          entryTerm: it.entryTerm,
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

export const importCourses = async (req: Request, res: Response): Promise<Response> => {
  const items: any[] = Array.isArray(req.body.items) ? req.body.items.slice(0, 2000) : [];
  let created = 0;
  let updated = 0;
  const errors: string[] = [];
  for (const [i, it] of items.entries()) {
    const name = String(it.name || "").trim();
    if (!name) { errors.push(`Linha ${i + 1}: sem nome`); continue; }
    const fee = it.monthlyFee === undefined || it.monthlyFee === "" ? null : Number(String(it.monthlyFee).replace(/\./g, "").replace(",", "."));
    if (fee !== null && Number.isNaN(fee)) { errors.push(`Linha ${i + 1}: mensalidade inválida`); continue; }
    const data: any = {
      name, category: it.category || null, level: it.level || null, modality: it.modality || null,
      monthlyFee: fee, semesters: Number(it.semesters) || 8, institutionId: req.body.institutionId || null, active: true
    };
    // eslint-disable-next-line no-await-in-loop
    const existing = await Course.findOne({ where: { name, category: data.category } });
    if (existing) { await existing.update(data); updated += 1; } else { await Course.create(data); created += 1; }
  }
  return res.json({ created, updated, errors: errors.slice(0, 20) });
};

export const options = async (_req: Request, res: Response): Promise<Response> =>
  res.json(CRM_OPTIONS);

export const getSettings = async (_req: Request, res: Response): Promise<Response> =>
  res.json({
    autoassign: await getSetting("crm_autoassign", "roundrobin"),
    autocreate: (await getSetting("crm_autocreate", "true")) !== "false",
    autoadvance: (await getSetting("crm_autoadvance", "true")) !== "false",
    ownerIds: JSON.parse(await getSetting("crm_owner_ids", "[]")),
    formToken: await getSetting("crm_form_token", ""),
    formTitle: await getSetting("crm_form_title", "Quero conhecer a instituição"),
    formThanks: await getSetting("crm_form_thanks", "Recebemos seus dados! Em breve um consultor entra em contato."),
    formColor: await getSetting("crm_form_color", "#0B4279")
  });

export const putSettings = async (req: Request, res: Response): Promise<Response> => {
  const b = req.body;
  if (b.autoassign !== undefined) await setSetting("crm_autoassign", b.autoassign === "none" ? "none" : "roundrobin");
  if (b.autocreate !== undefined) await setSetting("crm_autocreate", b.autocreate ? "true" : "false");
  if (b.autoadvance !== undefined) await setSetting("crm_autoadvance", b.autoadvance ? "true" : "false");
  if (Array.isArray(b.ownerIds)) await setSetting("crm_owner_ids", JSON.stringify(b.ownerIds.map(Number)));
  if (typeof b.formTitle === "string") await setSetting("crm_form_title", b.formTitle.slice(0, 120));
  if (typeof b.formThanks === "string") await setSetting("crm_form_thanks", b.formThanks.slice(0, 300));
  if (typeof b.formColor === "string" && /^#[0-9a-f]{6}$/i.test(b.formColor)) await setSetting("crm_form_color", b.formColor);
  if (b.regenerateFormToken || !(await getSetting("crm_form_token", ""))) {
    await setSetting("crm_form_token", randomBytes(16).toString("hex"));
  }
  return getSettings(req, res);
};

// ------------------------------------------------------------------ metrics
export const metrics = async (req: Request, res: Response): Promise<Response> => {
  const sequelize = (await import("../database")).default;
  const { QueryTypes } = await import("sequelize");
  const { startOfDay, endOfDay, subDays, parseISO } = await import("date-fns");
  const to = req.query.to ? endOfDay(parseISO(String(req.query.to))) : endOfDay(new Date());
  const from = req.query.from ? startOfDay(parseISO(String(req.query.from))) : startOfDay(subDays(new Date(), 29));
  const ownerId = req.query.ownerId ? Number(req.query.ownerId) : null;
  const courseId = req.query.courseId ? Number(req.query.courseId) : null;
  const rep = { from, to, ownerId, courseId };
  const f = `AND (:ownerId IS NULL OR l.ownerId = :ownerId) AND (:courseId IS NULL OR l.courseId = :courseId)`;
  const q = async (sql: string): Promise<any[]> =>
    (await sequelize.query(sql, { replacements: rep, type: QueryTypes.SELECT })) as any[];

  const [kpi] = await q(`
    SELECT COUNT(*) AS leads,
      SUM(s.type='won') AS won, SUM(s.type='lost') AS lost, SUM(s.type='open') AS open,
      AVG(CASE WHEN l.firstContactAt IS NOT NULL THEN TIMESTAMPDIFF(MINUTE, l.createdAt, l.firstContactAt) END) AS avgFirstContactMin,
      AVG(CASE WHEN l.wonAt IS NOT NULL THEN TIMESTAMPDIFF(HOUR, l.createdAt, l.wonAt)/24 END) AS avgDaysToEnroll,
      SUM(s.type='open' AND l.ownerId IS NULL) AS unassigned
    FROM Leads l JOIN LeadStages s ON s.id = l.stageId
    WHERE l.createdAt BETWEEN :from AND :to ${f}`);

  const funnel = await q(`
    SELECT s.id, s.name, s.color, s.type, s.position, COUNT(l.id) AS total
    FROM LeadStages s
    LEFT JOIN Leads l ON l.stageId = s.id AND l.createdAt BETWEEN :from AND :to ${f}
    GROUP BY s.id, s.name, s.color, s.type, s.position ORDER BY s.position`);

  const bySource = await q(`
    SELECT COALESCE(l.source,'Outro') AS name, COUNT(*) AS leads, SUM(s.type='won') AS won
    FROM Leads l JOIN LeadStages s ON s.id = l.stageId
    WHERE l.createdAt BETWEEN :from AND :to ${f} GROUP BY l.source ORDER BY leads DESC`);

  const byCourse = await q(`
    SELECT COALESCE(c.name,'Sem curso') AS name, COUNT(*) AS leads, SUM(s.type='won') AS won
    FROM Leads l JOIN LeadStages s ON s.id = l.stageId LEFT JOIN Courses c ON c.id = l.courseId
    WHERE l.createdAt BETWEEN :from AND :to ${f} GROUP BY c.id, c.name ORDER BY leads DESC LIMIT 12`);

  const byOwner = await q(`
    SELECT COALESCE(u.name,'Sem responsável') AS name, COUNT(*) AS leads, SUM(s.type='won') AS won,
      SUM(s.type='open') AS open,
      AVG(CASE WHEN l.firstContactAt IS NOT NULL THEN TIMESTAMPDIFF(MINUTE, l.createdAt, l.firstContactAt) END) AS avgFirstContactMin
    FROM Leads l JOIN LeadStages s ON s.id = l.stageId LEFT JOIN Users u ON u.id = l.ownerId
    WHERE l.createdAt BETWEEN :from AND :to ${f} GROUP BY u.id, u.name ORDER BY won DESC, leads DESC`);

  const lostReasons = await q(`
    SELECT COALESCE(l.lostReason,'Não informado') AS name, COUNT(*) AS total
    FROM Leads l JOIN LeadStages s ON s.id = l.stageId
    WHERE s.type='lost' AND l.createdAt BETWEEN :from AND :to ${f} GROUP BY l.lostReason ORDER BY total DESC`);

  const created = await q(`
    SELECT DATE(l.createdAt) AS day, COUNT(*) AS total FROM Leads l
    WHERE l.createdAt BETWEEN :from AND :to ${f} GROUP BY DATE(l.createdAt) ORDER BY day`);
  const wonDaily = await q(`
    SELECT DATE(l.wonAt) AS day, COUNT(*) AS total FROM Leads l
    WHERE l.wonAt BETWEEN :from AND :to ${f} GROUP BY DATE(l.wonAt) ORDER BY day`);

  const [attention] = await q(`
    SELECT
      (SELECT COUNT(*) FROM LeadTasks t JOIN Leads l ON l.id = t.leadId WHERE t.doneAt IS NULL AND t.dueAt < NOW() ${f}) AS overdueTasks,
      (SELECT COUNT(*) FROM Leads l JOIN LeadStages s ON s.id = l.stageId
         WHERE s.type='open' AND COALESCE(l.lastContactAt, l.createdAt) < DATE_SUB(NOW(), INTERVAL 3 DAY) ${f}) AS stale,
      (SELECT COUNT(*) FROM Leads l JOIN LeadStages s ON s.id = l.stageId
         WHERE s.type='open' AND l.firstContactAt IS NULL AND l.createdAt < DATE_SUB(NOW(), INTERVAL 1 HOUR) ${f}) AS waitingFirstContact`);

  const num = (v: any) => (v === null || v === undefined ? null : Number(v));
  return res.json({
    range: { from, to },
    kpi: {
      leads: Number(kpi.leads) || 0,
      won: Number(kpi.won) || 0,
      lost: Number(kpi.lost) || 0,
      open: Number(kpi.open) || 0,
      conversion: Number(kpi.leads) ? (Number(kpi.won) / Number(kpi.leads)) * 100 : 0,
      avgFirstContactMin: num(kpi.avgFirstContactMin),
      avgDaysToEnroll: num(kpi.avgDaysToEnroll),
      unassigned: Number(kpi.unassigned) || 0
    },
    funnel: funnel.map(r => ({ ...r, total: Number(r.total) })),
    bySource: bySource.map(r => ({ ...r, leads: Number(r.leads), won: Number(r.won) })),
    byCourse: byCourse.map(r => ({ ...r, leads: Number(r.leads), won: Number(r.won) })),
    byOwner: byOwner.map(r => ({ ...r, leads: Number(r.leads), won: Number(r.won), open: Number(r.open), avgFirstContactMin: num(r.avgFirstContactMin) })),
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
