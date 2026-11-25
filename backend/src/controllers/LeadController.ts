import { findCatalogCourse } from "../helpers/Institution";
import { normalizeModality, modalityTotals } from "../helpers/CourseModality";
import { touchAnalytics } from "../services/AnalyticsServices/Realtime";
import { hasContactAccessOrFree } from "../middleware/canAccessContact";
import { syncNextFollowUp } from "../services/CrmServices/FollowUp";
import { fire } from "../helpers/Fire";
import { Request, Response } from "express";
import { getBusinessConfig, normalizeBusiness, resetBusinessCache, businessMinutes, standardWeek } from "../helpers/BusinessTime";
import { dayBounds, shiftDays } from "../helpers/AppTime";
import { withLeadScope, withOnboardingScope, isAdminReq, reqRole, crmPolosOf, poloSql } from "../middleware/scope";
import { portable, nowSql, nowMinus, diffMinutes, diffHours, dayOf, countIf } from "../helpers/sqlDialect";
import { Op, literal } from "sequelize";
import { randomBytes } from "crypto";

import Lead from "../models/Lead";
import { logger } from "../utils/logger";
import Payment from "../models/Payment";
import LeadStage from "../models/LeadStage";
import Student from "../models/Student";
import { isManagerRole, roleOf } from "../helpers/Roles";
import LeadActivity from "../models/LeadActivity";
import LeadTask from "../models/LeadTask";
import LeadEnrollment from "../models/LeadEnrollment";
import { notifyTaskAssigned } from "../services/CrmServices/TaskNotify";
import Polo from "../models/Polo";
import Institution from "../models/Institution";
import Course from "../models/Course";
import User from "../models/User";
import Ticket from "../models/Ticket";
import Contact from "../models/Contact";
import Tag from "../models/Tag";
import { readDeadlines, runCadences } from "../services/CrmServices/Cadences";
import { DOCS_PENDING_LABEL, listDocuments, remindDocuments, requiredDocs, setDocumentStatus } from "../services/CrmServices/Documents";
import { FEE_PENDING_TAG } from "../services/PaymentServices/FeeTags";
import { affiliateStageId } from "../services/AffiliateServices/AffiliateLane";
import { RELATIONS, Relation, applyRelation } from "../services/CrmServices/Relation";
import { brPhoneVariants } from "../helpers/PhoneVariants";
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
import { syncHandoffTasks } from "../services/CrmServices/HandoffTasks";
import { runTaskSweep } from "../workers/TaskSweep";
import { assertTicketAccess } from "../middleware/canAccessTicket";

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
  // "any" = every lead an affiliate referred; a number = that affiliate
  if (q.affiliate === "any") where.affiliateId = { [Op.ne]: null };
  else if (q.affiliate) where.affiliateId = Number(q.affiliate);
  if (q.search) {
    // "maria" finds "Maria"; a "%" or "_" typed by the person is a character, not a wildcard
    const s = `%${String(q.search).trim().replace(/[\\%_]/g, "\\$&")}%`;
    const digits = String(q.search).replace(/\D/g, "");
    where[Op.or] = [
      { name: { [Op.iLike]: s } },
      { email: { [Op.iLike]: s } },
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

// the includes of the lists: a label narrows to the leads that have it; "ready=consultant" to the ones the AI agent qualified and left ready
const withTag = (tagId?: string, ready?: string) =>
  (leadInclude as any[]).map(i => {
    if (tagId && i.as === "tags") return { ...i, required: true, where: { id: tagId } };
    if (ready === "consultant" && i.as === "commercial") return { ...i, required: true, where: { readyForConsultant: true } };
    return i;
  });

export const index = async (req: Request, res: Response): Promise<Response> => {
  const limit = Math.min(Number(req.query.limit) || 50, 500);
  const offset = Number(req.query.offset) || 0;
  const { rows, count } = await Lead.findAndCountAll({
    where: await withLeadScope(req, buildWhere(req.query)),
    include: withTag(req.query.tagId as string, req.query.ready as string),
    // one column of the board is ordered by score first: the next page ("Carregar mais") must follow the same order,
    // or leads repeat and others are skipped
    order: req.query.stageId ? [["score", "DESC"], ["updatedAt", "DESC"]] : [["updatedAt", "DESC"]],
    limit,
    offset,
    distinct: true
  });
  return res.json({ leads: rows, count, hasMore: count > offset + rows.length });
};

export const board = async (req: Request, res: Response): Promise<Response> => {
  const stages = await LeadStage.findAll({ order: [["position", "ASC"]] });
  const where = await withLeadScope(req, buildWhere({ ...req.query, stageId: undefined }));
  const include = withTag(req.query.tagId as string, req.query.ready as string);
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
  // only the fields of the form: a lead is never tied to a contact, an affiliate or a consent date by the body of a request
  const allowed: Record<string, any> = {};
  [...FIELDS, "shift", "channel", "tagIds", "stageId"].forEach(f => { if (b[f] !== undefined) allowed[f] = b[f]; });
  if (isAdminReq(req) && b.affiliateId) allowed.affiliateId = b.affiliateId;
  // a non-manager puts a lead only in their own name: they cannot create it for (or hand it to) another person
  if (!isManagerRole(reqRole(req)) && b.ownerId !== undefined && b.ownerId !== null && Number(b.ownerId) !== uid(req)) {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }
  const { lead, created } = await upsertLead(
    {
      ...allowed,
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

  // only the management reassigns a lead to someone else; a non-manager may keep it with themselves, not hand it off
  if (patch.ownerId !== undefined && !isManagerRole(reqRole(req)) && Number(patch.ownerId) !== uid(req)) {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }
  const ownerChanged = patch.ownerId !== undefined && patch.ownerId !== lead.ownerId;
  const previousOwner = lead.ownerId;
  const same = (a: any, b: any): boolean => String(a ?? "").trim() === String(b ?? "").trim();
  const placeChanged = (patch.city !== undefined && !same(patch.city, lead.city)) || (patch.state !== undefined && !same(patch.state, lead.state));
  const courseChanged = patch.courseId !== undefined && Number(patch.courseId || 0) !== Number(lead.courseId || 0);
  await lead.update(patch);
  // the polo follows the city and the course; without a city, the wallet of whoever owns the lead
  if (placeChanged || courseChanged || ownerChanged) {
    const { settleLeadPolo, refreshCoursePolo } = await import("../services/PoloServices/LeadPolo");
    await settleLeadPolo(lead, { placeChanged })
      .then(() => (courseChanged ? refreshCoursePolo(lead) : undefined))
      .catch(err => logger.warn(`Polo of lead ${lead.id} was not decided: ${err}`));
  }
  // the open tasks follow whoever answers the lead now
  if (ownerChanged) await syncHandoffTasks(lead.contactId, previousOwner).catch(() => undefined);
  if (Array.isArray(req.body.tagIds)) {
    const nextTags: number[] = req.body.tagIds.map(Number);
    const beforeTags = ((await (lead as any).$get("tags", { attributes: ["id"], joinTableAttributes: [] })) as any[]).map(t => t.id);
    await (lead as any).$set("tags", nextTags);
    nextTags.filter(t => !beforeTags.includes(t)).forEach(tagId => fire("tag.added", { leadId: lead.id, contactId: lead.contactId, tagId }));
    beforeTags.filter(t => !nextTags.includes(t)).forEach(tagId => fire("tag.removed", { leadId: lead.id, contactId: lead.contactId, tagId }));
  }
  if (ownerChanged) {
    const owner = patch.ownerId ? await User.findByPk(patch.ownerId) : null;
    await addActivity(lead.id, uid(req), "system", owner ? `Responsável: ${owner.name}` : "Responsável removido");
  }
  await rescore(lead);
  const fresh = (await loadLead(lead.id)) as Lead;
  getIO().emit("lead", { action: "update", lead: fresh });
  await dispatchWebhook("lead.updated", { id: fresh.id, name: fresh.name, stage: fresh.stage?.name });
  return res.json(fresh);
};

export const remove = async (req: Request, res: Response): Promise<Response> => {
  const lead = await Lead.findByPk(req.params.id);
  if (!lead) throw new AppError("ERR_LEAD_NOT_FOUND", 404);
  // a student, or a lead with a paid charge, carries money and history that must stay
  if (lead.enrolledAt || lead.wonAt) throw new AppError("ERR_LEAD_DELETE_ENROLLED", 400);
  const paid = await Payment.count({ where: { leadId: lead.id, status: "paid" } as any });
  if (paid > 0) throw new AppError("ERR_LEAD_DELETE_PAID", 400);
  // only technical ids in the log (never the person's name)
  logger.warn(`Lead excluído por ${req.user.id}: #${lead.id} (etapa ${lead.stageId})`);
  await lead.destroy();
  getIO().emit("lead", { action: "delete", leadId: Number(req.params.id) });
  return res.json({ message: "deleted" });
};

// "This is not a lead": a friend or family member (or someone of the team) who wrote to the system. The lead leaves the funnel
// and every number, and no new lead is made for that person; the conversation stays. "customer" brings it back.
const RELATION_NOTE: Record<Relation, string> = {
  customer: "Voltou a ser tratado como cliente.",
  friend: "Marcado como amigo ou pessoal: saiu do funil e das estatísticas.",
  staff: "Marcado como da equipe: saiu do funil e das estatísticas."
};
export const classify = async (req: Request, res: Response): Promise<Response> => {
  const relation = String(req.body?.relation) as Relation;
  if (!RELATIONS.includes(relation)) throw new AppError("ERR_INVALID_PARAMETER", 400);
  const lead = await Lead.findByPk(req.params.id);
  if (!lead) throw new AppError("ERR_LEAD_NOT_FOUND", 404);
  // a student is never "just a friend": the mistake would take a paying student out of every number
  if (relation !== "customer" && lead.enrolledAt) throw new AppError("ERR_LEAD_ENROLLED_RELATION", 400);
  const contact = lead.contactId
    ? await Contact.findByPk(lead.contactId)
    : lead.phone
      ? await Contact.findOne({ where: { number: { [Op.in]: brPhoneVariants(lead.phone) }, isGroup: false } })
      : null;
  if (contact) await applyRelation(contact, relation, true);
  // no contact yet (a lead from a form): only the lead leaves, and its phone keeps no mark
  else await lead.update({ isHistorical: relation !== "customer" } as any);
  await addActivity(lead.id, uid(req), "system", RELATION_NOTE[relation]);
  getIO().emit("lead", { action: "update", lead: await loadLead(lead.id) });
  return res.json({ ok: true, relation });
};

export const setStage = async (req: Request, res: Response): Promise<Response> => {
  const { stageId, lostReason, lostNote } = req.body;
  // "Matriculado" is reached by confirming the enrollment (RGM, course, polo and tutor): the stage alone is refused, unless it is explicitly a
  // win that has no enrollment to confirm (skipEnroll, for the management)
  const target = await LeadStage.findByPk(Number(stageId), { attributes: ["id", "type"] });
  if (target && target.type === "won") {
    const current = await Lead.findByPk(req.params.id, { attributes: ["id", "enrolledAt"] });
    if (current && !current.enrolledAt && !(req.body.skipEnroll === true && isManagerRole(roleOf(req.user)))) {
      throw new AppError("ERR_ENROLL_REQUIRED", 409);
    }
  }
  // an enrolled student taken back to an open column: the enrollment is undone (asked first; it used to leave the lead in the open funnel
  // still saying "Matrícula confirmada", with no way to confirm it again)
  if (target && target.type === "open") {
    const current = await Lead.findByPk(req.params.id);
    if (current && current.enrolledAt) {
      if (req.body.undoEnroll !== true) throw new AppError("ERR_ENROLL_UNDO_CONFIRM", 409);
      const { undoEnrollment } = await import("../services/CrmServices/EnrollLead");
      await undoEnrollment(current, uid(req));
    }
  }
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


export const leadTasks = async (req: Request, res: Response): Promise<Response> =>
  res.json(
    await LeadTask.findAll({
      where: { leadId: req.params.id },
      include: [{ model: User, as: "user", attributes: ["id", "name"] }],
      order: [["dueAt", "ASC"]]
    })
  );

// who may touch a task that is not theirs: the management; anybody else only the tasks given to them, created by them or without a person
const canTouchTask = (req: Request, task: LeadTask): boolean =>
  isAdminReq(req) || !task.userId || Number(task.userId) === uid(req) || Number(task.createdById) === uid(req);

export const addTask = async (req: Request, res: Response): Promise<Response> => {
  const { title, type = "ligar", dueAt, userId, priority, ticketId } = req.body;
  if (!title || !dueAt) throw new AppError("ERR_FIELD_REQUIRED_title_dueAt");
  const due = new Date(dueAt);
  if (Number.isNaN(due.getTime())) throw new AppError("ERR_INVALID_DATE");
  const lead = await Lead.findByPk(req.params.id);
  if (!lead) throw new AppError("ERR_LEAD_NOT_FOUND", 404);
  // only the management gives a task to someone else
  if (userId && Number(userId) !== uid(req) && !isAdminReq(req)) throw new AppError("ERR_NO_PERMISSION", 403);
  let linkedTicketId: number | null = null;
  if (ticketId !== undefined && ticketId !== null && ticketId !== "") {
    const id = Number(ticketId);
    if (!Number.isSafeInteger(id) || id < 1) throw new AppError("ERR_NO_TICKET_FOUND", 404);
    await assertTicketAccess(req, id, "read");
    const ticket = await Ticket.findByPk(id, { attributes: ["id", "contactId"] });
    if (!ticket) throw new AppError("ERR_NO_TICKET_FOUND", 404);
    if (!lead.contactId || Number(ticket.contactId) !== Number(lead.contactId)) throw new AppError("ERR_NO_PERMISSION", 403);
    linkedTicketId = ticket.id;
  }
  const assignedUserId = isAdminReq(req) ? (userId || lead.ownerId || uid(req)) : uid(req);
  const task = await LeadTask.create({
    leadId: lead.id,
    title: String(title).slice(0, 160),
    type,
    dueAt: due,
    userId: assignedUserId,
    kind: "manual",
    priority: priority === "high" ? "high" : "normal",
    ticketId: linkedTicketId,
    createdById: uid(req)
  } as any);
  await addActivity(lead.id, uid(req), "task", `Tarefa criada: ${title}`);
  touchAnalytics(task.userId);
  await syncNextFollowUp(lead.id);
  void notifyTaskAssigned(task, uid(req));
  return res.status(201).json(task);
};

export const updateTask = async (req: Request, res: Response): Promise<Response> => {
  const task = await LeadTask.findOne({ where: { id: req.params.taskId, leadId: req.params.id } });
  if (!task) throw new AppError("ERR_NOT_FOUND", 404);
  if (!canTouchTask(req, task)) throw new AppError("ERR_NO_PERMISSION", 403);
  const { title, dueAt, type, userId, priority } = req.body;
  // handing a task to another person (or taking it out of someone) is for the management
  const reassign = userId !== undefined && (userId === null ? task.userId !== null : Number(userId) !== Number(task.userId));
  if (reassign && !isAdminReq(req) && Number(userId) !== uid(req)) throw new AppError("ERR_NO_PERMISSION", 403);
  if (dueAt && Number.isNaN(new Date(dueAt).getTime())) throw new AppError("ERR_INVALID_DATE");
  const was = task.userId;
  await task.update({
    ...(title ? { title: String(title).slice(0, 160) } : {}),
    ...(type ? { type } : {}),
    ...(priority ? { priority: priority === "high" ? "high" : "normal" } : {}),
    ...(reassign ? { userId: userId === null ? null : Number(userId), notifiedAt: null } : {}),
    ...(dueAt ? { dueAt: new Date(dueAt), notifiedAt: null } : {})
  });
  await syncNextFollowUp(task.leadId);
  if (reassign && task.userId && Number(task.userId) !== Number(was)) void notifyTaskAssigned(task, uid(req));
  if (reassign) await addActivity(task.leadId, uid(req), "task", `Tarefa "${task.title}" passada para outra pessoa.`);
  [was, task.userId].filter(Boolean).forEach(id => getIO().emit("taskChanged", { userId: id, leadId: task.leadId }));
  return res.json(task);
};

// concluding (or reopening) says which one it is: a click on a task the system closed a moment ago does not reopen it
export const setTaskDone = async (req: Request, res: Response): Promise<Response> => {
  const task = await LeadTask.findOne({ where: { id: req.params.taskId, leadId: req.params.id } });
  if (!task) throw new AppError("ERR_NOT_FOUND", 404);
  if (!canTouchTask(req, task)) throw new AppError("ERR_NO_PERMISSION", 403);
  const want = req.body?.done === undefined ? !task.doneAt : req.body.done !== false && req.body.done !== "false";
  if (want && !task.doneAt) {
    await task.update({ doneAt: new Date(), doneById: uid(req), closedReason: "done" } as any);
    await addActivity(task.leadId, uid(req), "task", `Tarefa concluída: ${task.title}`);
  } else if (!want && task.doneAt) {
    await task.update({ doneAt: null, doneById: null, closedReason: null, notifiedAt: null } as any);
  }
  touchAnalytics(task.userId);
  await syncNextFollowUp(task.leadId);
  if (task.userId) getIO().emit("taskChanged", { userId: task.userId, leadId: task.leadId });
  return res.json(task);
};
export const completeTask = setTaskDone;

export const removeTask = async (req: Request, res: Response): Promise<Response> => {
  const task = await LeadTask.findOne({ where: { id: req.params.taskId, leadId: req.params.id } });
  if (!task) throw new AppError("ERR_NOT_FOUND", 404);
  if (!canTouchTask(req, task)) throw new AppError("ERR_NO_PERMISSION", 403);
  await task.destroy();
  await addActivity(task.leadId, uid(req), "task", `Tarefa apagada: ${task.title}`);
  await syncNextFollowUp(task.leadId);
  if (task.userId) getIO().emit("taskChanged", { userId: task.userId, leadId: task.leadId });
  return res.json({ message: "deleted" });
};

// hands the open tasks of people without a WhatsApp to whoever answers the lead (the rest become "sem responsavel"); the same sweep runs on its own every 30 minutes
export const releaseUnreachable = async (_req: Request, res: Response): Promise<Response> => res.json(await runTaskSweep());

// the filter of the list: overdue (due already), today (still to come today), upcoming (after today), open (all not done), done
const taskWhere = async (req: Request, status: string): Promise<any> => {
  const where: any = {};
  const { scope = "mine" } = req.query as any;
  if (scope === "mine" || !isAdminReq(req)) where.userId = uid(req);
  // a manager looking at one person's tasks: the person is filtered here (a filter on the screen came after the 300-row limit)
  else if ((req.query as any).userId === "0") where.userId = { [Op.is]: null };
  else if (Number((req.query as any).userId)) where.userId = Number((req.query as any).userId);
  // the coordination looking at the team: only the tasks of the leads of its polos (its own tasks stay whole)
  if (scope !== "mine" && isAdminReq(req)) {
    const polos = await crmPolosOf(req);
    if (polos) where.leadId = { [Op.in]: literal(`(SELECT l.id FROM "Leads" l WHERE true ${poloSql(polos, 'l."poloId"')})`) };
  }
  const now = new Date();
  const { end } = dayBounds();
  if (status === "done") where.doneAt = { [Op.not]: null };
  else where.doneAt = { [Op.is]: null };
  if (status === "overdue") where.dueAt = { [Op.lt]: now };
  // "Hoje" is what is still to come today: what already passed is in "Atrasadas" (a task never counts in both)
  if (status === "today") where.dueAt = { [Op.between]: [now, end] };
  if (status === "upcoming") where.dueAt = { [Op.gt]: end };
  return where;
};

export const tasksIndex = async (req: Request, res: Response): Promise<Response> => {
  const status = String((req.query as any).status || "open");
  const rows = await LeadTask.findAll({
    where: await taskWhere(req, status),
    include: [
      { model: Lead, as: "lead", attributes: ["id", "name", "phone", "stageId", "contactId"], include: [{ model: LeadStage, as: "stage", attributes: ["name", "color"] }] },
      { model: User, as: "user", attributes: ["id", "name"] },
      { model: User, as: "doneBy", attributes: ["id", "name"], required: false }
    ],
    // the ones already done show the latest first (they stay registered); the open ones: urgent first, then by due date
    order: status === "done" ? [["doneAt", "DESC"]] : [[literal(`CASE WHEN "LeadTask"."priority" = 'high' THEN 0 ELSE 1 END`), "ASC"], ["dueAt", "ASC"]],
    limit: 300
  });
  return res.json(rows);
};

// the numbers of the tabs, of the menu badge and of the strip on top, in one request
export const tasksCounts = async (req: Request, res: Response): Promise<Response> => {
  const [overdue, today, upcoming] = await Promise.all(["overdue", "today", "upcoming"].map(async st => LeadTask.count({ where: await taskWhere(req, st) })));
  return res.json({ overdue, today, upcoming, open: overdue + today + upcoming });
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
  if (!(await hasContactAccessOrFree(req, contact.id))) throw new AppError("ERR_NO_PERMISSION", 403);
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
  // a non-manager imports leads only in their own name, never assigning the batch to someone else
  if (!isManagerRole(reqRole(req)) && req.body.ownerId && Number(req.body.ownerId) !== uid(req)) {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }
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
  fields: ["name", "level", "modality", "category", "semesters", "institutionId", "monthlyFee", "active", "durationMonths", "installmentsTotal", "enrollmentFee", "certificationFee", "singlePayment"],
  required: ["name"],
  order: [["name", "ASC"]],
  beforeSave: data => {
    if (data.monthlyFee === "" || data.monthlyFee === undefined) data.monthlyFee = null;
    // optional numbers of a course in installments: empty means "not set"
    ["durationMonths", "installmentsTotal", "enrollmentFee", "certificationFee"].forEach(k => { if (data[k] === "") data[k] = null; });
    if (data.semesters === "" || data.semesters === null) delete data.semesters;
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


// a money cell of the sheet: "1.073,80", "1073,80", "R$ 99" or a number; empty is null, anything else NaN
const moneyCell = (v: any): number | null => {
  if (v === undefined || v === null || String(v).trim() === "") return null;
  if (typeof v === "number") return v;
  return Number(String(v).replace(/[^\d.,-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."));
};
// a whole number cell (months, installments): empty is null
const countCell = (v: any): number | null => {
  if (v === undefined || v === null || String(v).trim() === "") return null;
  const n = Number(String(v).replace(/[^\d]/g, ""));
  return Number.isFinite(n) ? n : NaN;
};

// body: { items: [{ name, category, level, modality, monthlyFee, semesters, active, institution, durationMonths, installmentsTotal,
//   enrollmentFee, certificationFee, singlePayment }], institutionId, dryRun }
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
    // courses in installments (post-graduate, technical, short courses)
    const durationMonths = countCell(it.durationMonths);
    if (durationMonths !== null && (!(durationMonths >= 1) || durationMonths > 120)) { rows.push({ line, status: "error", error: "Duração em meses deve ser de 1 a 120", name }); continue; }
    const installmentsTotal = countCell(it.installmentsTotal);
    if (installmentsTotal !== null && (!(installmentsTotal >= 1) || installmentsTotal > 120)) { rows.push({ line, status: "error", error: "Parcelas deve ser um número de 1 a 120", name }); continue; }
    const enrollmentFee = moneyCell(it.enrollmentFee);
    const certificationFee = moneyCell(it.certificationFee);
    if ([enrollmentFee, certificationFee].some(v => v !== null && (Number.isNaN(v) || (v as number) < 0))) { rows.push({ line, status: "error", error: "Taxa inválida", name }); continue; }
    let institutionId = req.body.institutionId ? Number(req.body.institutionId) : null;
    if (it.institution) {
      const inst = institutions.find(x => x.name.toLowerCase() === String(it.institution).trim().toLowerCase());
      if (!inst) { rows.push({ line, status: "error", error: `Instituição "${it.institution}" não cadastrada`, name }); continue; }
      institutionId = inst.id;
    }
    const data: any = {
      name, category: String(it.category || "").trim() || null, level: String(it.level || "").trim() || null,
      modality: normalizeModality(it.modality), monthlyFee: fee, semesters, institutionId, active: yes(it.active),
      durationMonths, installmentsTotal, enrollmentFee, certificationFee, singlePayment: yes(it.singlePayment, false)
    };
    // the same course of two universities is two courses (one line per university)
    // eslint-disable-next-line no-await-in-loop
    const existing = await findCatalogCourse({ name, category: data.category, modality: data.modality }, data.institutionId ?? null);
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

// Loads the catalogue shipped with the system (admin button on the courses tab)
export const loadDefaultCourses = async (req: Request, res: Response): Promise<Response> => {
  const { loadDefaultCatalog } = await import("../services/CrmServices/CatalogLoader");
  return res.json(await loadDefaultCatalog({ force: Boolean(req.body?.force) }));
};

export const options = async (_req: Request, res: Response): Promise<Response> => {
  const { terms, defaultTerm } = await getEntryTerms();
  // the periods of the polo goals in force: the team may record a student in one of them (a late enrollment of the previous semester)
  // even when it is no longer offered to new leads (entryTerms, what the AI and the forms offer)
  const { default: Goal } = await import("../models/Goal");
  const { goalTerm } = await import("../helpers/EntryTerm");
  const goals = await Goal.findAll({ where: { kind: "polo", status: "active" }, attributes: ["entryTerm", "title"] });
  const goalTerms = [...new Set(goals.map(g => goalTerm(g)).filter(Boolean) as string[])].sort();
  return res.json({ ...CRM_OPTIONS, entryTerms: terms, defaultEntryTerm: defaultTerm, goalTerms });
};

export const getSettings = async (_req: Request, res: Response): Promise<Response> =>
  res.json({
    autoassign: await getSetting("crm_autoassign", "roundrobin"),
    autocreate: (await getSetting("crm_autocreate", "true")) !== "false",
    autoadvance: (await getSetting("crm_autoadvance", "true")) !== "false",
    // the client who writes again goes straight back to their consultant (see ReturningClient)
    returnToOwner: (await getSetting("return_to_owner", "true")) !== "false",
    returnAwayMessage: await getSetting("return_to_owner_away_message", ""),
    ownerIds: JSON.parse(await getSetting("crm_owner_ids", "[]")),
    entryTerms: (await getEntryTerms()).terms,
    // the last day to enroll in each period (the reminders of "deadline close" count from it)
    entryDeadlines: await readDeadlines(),
    // the classes of each period: enrollment window, boleto deadline, AVA release and installments (the proposal takes its dates from it)
    entryCalendar: await (await import("../services/CrmServices/EntryCalendar")).getEntryCalendar(),
    // the documents a student delivers after the enrollment, and the automatic reminder about the missing ones
    requiredDocs: await requiredDocs(),
    docsAutoReminder: (await getSetting("docs_auto_reminder", "false")) === "true",
    docsReminderDays: Number(await getSetting("docs_reminder_days", "3")),
    docsReminderMax: Number(await getSetting("docs_reminder_max", "3")),
    defaultEntryTerm: (await getEntryTerms()).defaultTerm,
    formToken: await getSetting("crm_form_token", ""),
    formTitle: await getSetting("crm_form_title", "Quero conhecer a instituição"),
    formThanks: await getSetting("crm_form_thanks", "Recebemos seus dados! Em breve um consultor entra em contato."),
    formColor: await getSetting("crm_form_color", "#0B4279"),
    slaMinutes: Number(await getSetting("crm_sla_minutes", "15")),
    businessHours: await getBusinessConfig(),
    // the team's standard week (Mon-Thu 08-18, Fri 08-17): what a day turned on starts with on the screens
    standardWeek: standardWeek()
  });

export const putSettings = async (req: Request, res: Response): Promise<Response> => {
  const b = req.body;
  if (b.autoassign !== undefined) await setSetting("crm_autoassign", b.autoassign === "none" ? "none" : "roundrobin");
  if (b.autocreate !== undefined) await setSetting("crm_autocreate", b.autocreate ? "true" : "false");
  if (b.autoadvance !== undefined) await setSetting("crm_autoadvance", b.autoadvance ? "true" : "false");
  if (b.returnToOwner !== undefined) await setSetting("return_to_owner", b.returnToOwner ? "true" : "false");
  if (typeof b.returnAwayMessage === "string") await setSetting("return_to_owner_away_message", b.returnAwayMessage.trim().slice(0, 500));
  if (Array.isArray(b.entryTerms)) {
    const terms = b.entryTerms.map((t: any) => String(t).trim()).filter((t: string) => /^20\d{2}\/[12]$/.test(t));
    await setSetting("crm_entry_terms", JSON.stringify(terms));
  }
  if (typeof b.defaultEntryTerm === "string") await setSetting("crm_default_entry", b.defaultEntryTerm);
  if (Array.isArray(b.requiredDocs)) {
    const names = [...new Set(b.requiredDocs.map((d: any) => String(d).trim().slice(0, 120)).filter(Boolean))].slice(0, 30);
    await setSetting("crm_required_docs", JSON.stringify(names));
  }
  if (b.docsAutoReminder !== undefined) await setSetting("docs_auto_reminder", b.docsAutoReminder ? "true" : "false");
  if (b.docsReminderDays !== undefined) await setSetting("docs_reminder_days", String(Math.min(30, Math.max(1, Math.round(Number(b.docsReminderDays) || 3)))));
  if (b.docsReminderMax !== undefined) await setSetting("docs_reminder_max", String(Math.min(10, Math.max(1, Math.round(Number(b.docsReminderMax) || 3)))));
  if (b.entryDeadlines && typeof b.entryDeadlines === "object") {
    const out: Record<string, string> = {};
    Object.entries(b.entryDeadlines).forEach(([term, date]) => {
      if (/^20\d{2}\/[12]$/.test(term) && /^\d{4}-\d{2}-\d{2}$/.test(String(date))) out[term] = String(date);
    });
    await setSetting("crm_entry_deadlines", JSON.stringify(out));
  }
  if (Array.isArray(b.entryCalendar)) await (await import("../services/CrmServices/EntryCalendar")).saveEntryCalendar(b.entryCalendar);
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


// whose leads a panel may be narrowed to: the management sees everybody or picks one person; every other profile (consultant,
// tutor, academic, relationship) only ever sees its own leads: a tutor who received nothing sees nothing, never the team's numbers
const ownerFilter = (req: Request): number | null => {
  const self = Number(req.user.id);
  if (!isManagerRole(reqRole(req))) return self;
  const asked = req.query.ownerId ? Number(req.query.ownerId) : null;
  return asked && Number.isInteger(asked) ? asked : null;
};
// ------------------------------------------------------------------ triage ("novos para conferir")
// New people nobody answered yet, each one to its OWNER: a consultant only sees (and answers for) their own; the management sees everybody or one person
// (?ownerId=). The one responsible is who ANSWERS the conversation (the owner of its open ticket), or the owner of the lead when nobody has it yet:
// a lead of the administrator that Pedro is attending is Pedro's to check. "late" = it arrived on a previous day: the check is due the same day, before the day closes.
export const triageList = async (req: Request, res: Response): Promise<Response> => {
  const sequelize = (await import("../database")).default;
  const { QueryTypes } = await import("sequelize");
  const ownerId = ownerFilter(req);
  // the coordination sees the new people of its polos only
  const polos = poloSql(await crmPolosOf(req));
  const todayStart = dayBounds(undefined).start;
  const rows = (await sequelize.query(
    portable(`
    SELECT l.id, l.name, l.phone, l.source, l.createdAt, COALESCE(t.userId, l.ownerId) AS ownerId, u.name AS ownerName
    FROM Leads l JOIN LeadStages s ON s.id = l.stageId
    LEFT JOIN Tickets t ON t.id = (SELECT t2.id FROM Tickets t2 WHERE t2.contactId = l.contactId AND t2.status <> 'closed' ORDER BY t2.id DESC LIMIT 1)
    LEFT JOIN Users u ON u.id = COALESCE(t.userId, l.ownerId)
    WHERE s.type = 'open' AND l.firstContactAt IS NULL AND l.enrolledAt IS NULL AND l.isHistorical = false
      AND (:ownerId IS NULL OR COALESCE(t.userId, l.ownerId) = :ownerId) ${polos}
    ORDER BY l.createdAt ASC LIMIT 200`),
    { replacements: { ownerId }, type: QueryTypes.SELECT }
  )) as any[];
  const items = rows.map(r => ({ ...r, late: new Date(r.createdAt) < todayStart }));
  const late = items.filter(i => i.late).length;
  return res.json({ items, late, today: items.length - late, total: items.length });
};

// ------------------------------------------------------------------ metrics
const crmNow = async (q: (sql: string) => Promise<any[]>, f: string, lane: number | null) => {
  const funnel = await q(`
    SELECT s.id, s.name, s.color, s.type, s.position, COUNT(l.id) AS total
    FROM LeadStages s LEFT JOIN Leads l ON l.stageId = s.id ${f}
    GROUP BY s.id, s.name, s.color, s.type, s.position ORDER BY s.position`);
  const byOwner = await q(`
    SELECT COALESCE(u.name,'Sem responsável') AS name, u.id AS ownerId, COUNT(*) AS open,
      ${countIf(`l.firstContactAt IS NULL AND l.createdAt < ${nowMinus(1, "HOUR")}`)} AS waiting,
      ${countIf(`COALESCE(l.lastContactAt, l.createdAt) < ${nowMinus(3, "DAY")}`)} AS stale
    FROM Leads l JOIN LeadStages s ON s.id = l.stageId LEFT JOIN Users u ON u.id = l.ownerId
    WHERE s.type = 'open' ${f} GROUP BY u.id, u.name ORDER BY waiting DESC, open DESC`);
  const [attention] = await q(`
    SELECT
      (SELECT COUNT(*) FROM LeadTasks t JOIN Leads l ON l.id = t.leadId WHERE t.doneAt IS NULL AND t.dueAt < ${nowSql()} ${f}) AS overdueTasks,
      (SELECT COUNT(*) FROM Leads l JOIN LeadStages s ON s.id = l.stageId
         WHERE s.type='open' AND COALESCE(l.lastContactAt, l.createdAt) < ${nowMinus(3, 'DAY')} ${f}) AS stale,
      (SELECT COUNT(*) FROM Leads l JOIN LeadStages s ON s.id = l.stageId
         WHERE s.type='open' AND l.firstContactAt IS NULL AND l.createdAt < ${nowMinus(1, 'HOUR')} ${f}) AS waitingFirstContact,
      (SELECT COUNT(*) FROM Leads l JOIN LeadStages s ON s.id = l.stageId
         WHERE s.type='open' AND l.ownerId IS NULL ${f}) AS unassigned,
      (SELECT COUNT(DISTINCT l.id) FROM Leads l JOIN LeadTags lt ON lt.leadId = l.id JOIN Tags tg ON tg.id = lt.tagId
         WHERE tg.name = :feeTag ${f}) AS feePending,
      (SELECT COUNT(DISTINCT l.id) FROM Leads l JOIN LeadTags lt ON lt.leadId = l.id JOIN Tags tg ON tg.id = lt.tagId
         WHERE tg.name = :docsTag ${f}) AS docsPending`);
  const tagIds = await Tag.findAll({ where: { name: { [Op.in]: [FEE_PENDING_TAG.name, DOCS_PENDING_LABEL.name] } }, attributes: ["id", "name"] });
  const tagIdOf = (name: string) => tagIds.find(t => t.name === name)?.id ?? null;
  return {
    now: true,
    funnel: funnel.map(r => ({ ...r, total: Number(r.total), isAffiliateLane: !!lane && Number(r.id) === lane })),
    byOwner: byOwner.map(r => ({ ...r, open: Number(r.open), waiting: Number(r.waiting), stale: Number(r.stale) })),
    attention: {
      overdueTasks: Number(attention.overdueTasks) || 0,
      stale: Number(attention.stale) || 0,
      waitingFirstContact: Number(attention.waitingFirstContact) || 0,
      unassigned: Number(attention.unassigned) || 0,
      feePending: Number(attention.feePending) || 0,
      docsPending: Number(attention.docsPending) || 0,
      feeTagId: tagIdOf(FEE_PENDING_TAG.name),
      docsTagId: tagIdOf(DOCS_PENDING_LABEL.name)
    }
  };
};

export const metrics = async (req: Request, res: Response): Promise<Response> => {
  const sequelize = (await import("../database")).default;
  const { QueryTypes } = await import("sequelize");
  const to = dayBounds(req.query.to ? String(req.query.to) : undefined).end;
  const from = req.query.from ? dayBounds(String(req.query.from)).start : dayBounds(shiftDays(new Date(), -29)).start;
  // consultants only ever see their own numbers
  const ownerId = ownerFilter(req);
  const courseId = req.query.courseId ? Number(req.query.courseId) : null;
  const rep = { from, to, ownerId, courseId, feeTag: FEE_PENDING_TAG.name, docsTag: DOCS_PENDING_LABEL.name };
  // "of a person" = the lead that person ANSWERS (owner of its open conversation, or of the lead while nobody has it): the same rule of the list of new leads
  // the coordination: only the leads of its polos (the same rule of the lists, see middleware/scope)
  const polos = poloSql(await crmPolosOf(req));
  const f = `AND l.isHistorical = false AND (:ownerId IS NULL OR COALESCE((SELECT t9.userId FROM Tickets t9 WHERE t9.contactId = l.contactId AND t9.status <> 'closed' ORDER BY t9.id DESC LIMIT 1), l.ownerId) = :ownerId) AND (:courseId IS NULL OR l.courseId = :courseId) ${polos}`;
  const lane = await affiliateStageId();
  const q = async (sql: string): Promise<any[]> =>
    (await sequelize.query(portable(sql), { replacements: rep, type: QueryTypes.SELECT })) as any[];

  // the Painel do CRM is "what to do now": the funnel as it is today, who is waiting and the points of attention, with no period
  // (the results of a period live in Estatísticas → Captação, from the same endpoint without "now")
  if (req.query.now) return res.json(await crmNow(q, f, lane));

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
  // second courses of the same person are enrollments too (the same rule of Matrículas realizadas)
  const [extra] = await q(`
    SELECT COUNT(*) AS total FROM LeadEnrollments e JOIN Leads l ON l.id = e.leadId
    WHERE e.createdAt BETWEEN :from AND :to ${f}`).catch(() => [{ total: 0 }]);

  // the enrollments of the period by the format of the course: only the formats the system has (Presencial, EAD, Semipresencial, Flex)
  const byModality = await q(`
    SELECT COALESCE(NULLIF(c.modality,''), NULLIF(l.modality,''), 'Não informado') AS name, COUNT(*) AS total
    FROM Leads l LEFT JOIN Courses c ON c.id = l.courseId
    WHERE l.wonAt BETWEEN :from AND :to ${f} GROUP BY 1 ORDER BY total DESC`);

  // new people waiting for the first contact: the team confirms who is a lead (or marks a friend / team member)
  const triage = await q(`
    SELECT l.id, l.name, l.phone, l.source, l.createdAt, l.ownerId AS ownerId, u.name AS ownerName FROM Leads l JOIN LeadStages s ON s.id = l.stageId
    LEFT JOIN Users u ON u.id = l.ownerId
    WHERE s.type = 'open' AND l.firstContactAt IS NULL AND l.enrolledAt IS NULL ${f}
    ORDER BY l.createdAt ASC LIMIT 30`);

  // the same count for the period right before this one, to show the change
  const span = to.getTime() - from.getTime();
  const [prev] = await sequelize.query(
    portable(`SELECT COUNT(*) AS leads, ${countIf("s.type='won'")} AS won, ${countIf("s.type='lost'")} AS lost,
        (SELECT COUNT(*) FROM Leads l WHERE l.wonAt BETWEEN :pfrom AND :pto ${f}) AS enrollments
      FROM Leads l JOIN LeadStages s ON s.id = l.stageId
      WHERE l.createdAt BETWEEN :pfrom AND :pto ${f}`),
    { replacements: { ...rep, pfrom: new Date(from.getTime() - span - 1), pto: new Date(from.getTime() - 1) }, type: QueryTypes.SELECT }
  ) as any[];

  // open leads nobody contacted for over an hour, by consultant (now, not tied to the period)
  const waitingByOwner = await q(`
    SELECT l.ownerId AS ownerId, COUNT(*) AS total FROM Leads l JOIN LeadStages s ON s.id = l.stageId
    WHERE s.type = 'open' AND l.firstContactAt IS NULL AND l.createdAt < ${nowMinus(1, "HOUR")} ${f} GROUP BY l.ownerId`);

  const [attention] = await q(`
    SELECT
      (SELECT COUNT(*) FROM LeadTasks t JOIN Leads l ON l.id = t.leadId WHERE t.doneAt IS NULL AND t.dueAt < ${nowSql()} ${f}) AS overdueTasks,
      (SELECT COUNT(*) FROM Leads l JOIN LeadStages s ON s.id = l.stageId
         WHERE s.type='open' AND COALESCE(l.lastContactAt, l.createdAt) < ${nowMinus(3, 'DAY')} ${f}) AS stale,
      (SELECT COUNT(*) FROM Leads l JOIN LeadStages s ON s.id = l.stageId
         WHERE s.type='open' AND l.firstContactAt IS NULL AND l.createdAt < ${nowMinus(1, 'HOUR')} ${f}) AS waitingFirstContact,
      (SELECT COUNT(*) FROM Leads l JOIN LeadStages s ON s.id = l.stageId
         WHERE s.type='open' AND l.ownerId IS NULL ${f}) AS unassigned,
      (SELECT COUNT(DISTINCT l.id) FROM Leads l JOIN LeadTags lt ON lt.leadId = l.id JOIN Tags tg ON tg.id = lt.tagId
         WHERE tg.name = :feeTag ${f}) AS feePending,
      (SELECT COUNT(DISTINCT l.id) FROM Leads l JOIN LeadTags lt ON lt.leadId = l.id JOIN Tags tg ON tg.id = lt.tagId
         WHERE tg.name = :docsTag ${f}) AS docsPending`);

  // the funnel opens filtered by these labels when a card of the panel is clicked
  const tagIds = await Tag.findAll({ where: { name: { [Op.in]: [FEE_PENDING_TAG.name, DOCS_PENDING_LABEL.name] } }, attributes: ["id", "name"] });
  const tagIdOf = (name: string) => tagIds.find(t => t.name === name)?.id ?? null;
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
    // the column of the people an affiliate referred comes before the funnel (it only holds them until the first contact)
    funnel: funnel.map(r => ({ ...r, total: Number(r.total), isAffiliateLane: !!lane && Number(r.id) === lane })),
    bySource: bySource.map(r => ({ ...r, leads: Number(r.leads), won: Number(r.won) })),
    byCourse: byCourse.map(r => ({ ...r, leads: Number(r.leads), won: Number(r.won) })),
    byOwner: byOwner.map(r => {
      const k = sums[String(r.ownerId ?? "none")];
      const w = waitingByOwner.find(x => (x.ownerId ?? null) === (r.ownerId ?? null));
      return { ...r, leads: Number(r.leads), won: Number(r.won), open: Number(r.open), avgFirstContactMin: k ? k.s / k.n : null, waiting: w ? Number(w.total) : 0 };
    }),
    previous: { leads: Number(prev?.leads) || 0, won: Number(prev?.won) || 0, lost: Number(prev?.lost) || 0, enrollments: Number(prev?.enrollments) || 0, conversion: Number(prev?.leads) ? (Number(prev.won) / Number(prev.leads)) * 100 : 0 },
    byModality: modalityTotals(byModality),
    triage: triage.map(r => ({ id: r.id, name: r.name, phone: r.phone, source: r.source, createdAt: r.createdAt, ownerId: r.ownerId, ownerName: r.ownerName, late: new Date(r.createdAt) < dayBounds(undefined).start })),
    lostReasons: lostReasons.map(r => ({ ...r, total: Number(r.total) })),
    enrollmentsInPeriod: wonDaily.reduce((a, r) => a + Number(r.total || 0), 0) + (Number(extra?.total) || 0),
    created: created.map(r => ({ day: r.day, total: Number(r.total) })),
    wonDaily: wonDaily.map(r => ({ day: r.day, total: Number(r.total) })),
    attention: {
      overdueTasks: Number(attention.overdueTasks) || 0,
      stale: Number(attention.stale) || 0,
      waitingFirstContact: Number(attention.waitingFirstContact) || 0,
      unassigned: Number(attention.unassigned) || 0,
      feePending: Number(attention.feePending) || 0,
      docsPending: Number(attention.docsPending) || 0,
      feeTagId: tagIdOf(FEE_PENDING_TAG.name),
      docsTagId: tagIdOf(DOCS_PENDING_LABEL.name)
    }
  });
};

// ---------------------------------------------------------- enrollment -> tutor
export const enroll = async (req: Request, res: Response): Promise<Response> => {
  const lead = await Lead.findByPk(req.params.id);
  if (!lead) throw new AppError("ERR_LEAD_NOT_FOUND", 404);
  if (!req.body.poloId) throw new AppError("ERR_FIELD_REQUIRED_poloId");
  const { default: enrollLead } = await import("../services/CrmServices/EnrollLead");
  const result: any = await enrollLead(lead, uid(req), {
      poloId: Number(req.body.poloId),
      tutorId: req.body.tutorId,
      note: req.body.note,
      fee: req.body.fee,
      feeDueDate: req.body.feeDueDate,
      introMessage: req.body.introMessage,
      whatsappId: req.body.whatsappId ? Number(req.body.whatsappId) : null,
      additional: req.body.additional === true,
      courseId: req.body.courseId ? Number(req.body.courseId) : null,
      courseName: req.body.courseName || null,
      rgm: req.body.rgm || null,
      entryTerm: req.body.entryTerm || null
    });
  // the print attached in the dialog becomes the proof of this enrollment (the first one, or the extra course)
  if (req.body.proofId && !result.repeated) {
    const { attachProof } = await import("../services/CommercialServices/EnrollmentProof");
    await attachProof(lead.id, Number(req.body.proofId), result.enrollment?.id || null);
  }
  return res.json(result);
};

// every enrollment of the student: the first (on the lead) and the ones after it
export const enrollments = async (req: Request, res: Response): Promise<Response> => {
  const lead = await Lead.findByPk(req.params.id, { include: [{ model: Course, as: "course", attributes: ["id", "name"] }] });
  if (!lead) throw new AppError("ERR_LEAD_NOT_FOUND", 404);
  const extra = await LeadEnrollment.findAll({ where: { leadId: lead.id }, order: [["enrolledAt", "ASC"], ["id", "ASC"]] });
  const poloIds = Array.from(new Set([lead.poloId, ...extra.map(e => e.poloId)].filter(Boolean) as number[]));
  const polos = poloIds.length ? await Polo.findAll({ where: { id: poloIds }, attributes: ["id", "name"] }) : [];
  const name = (id: number | null) => polos.find(p => p.id === id)?.name || null;
  const list = [
    ...(lead.enrolledAt ? [{ id: null, number: 1, courseName: (lead as any).course?.name || null, poloName: name(lead.poloId), enrolledAt: lead.enrolledAt }] : []),
    ...extra.map((e, i) => ({ id: e.id, number: (lead.enrolledAt ? 2 : 1) + i, courseName: e.courseName, poloName: name(e.poloId), enrolledAt: e.enrolledAt }))
  ];
  return res.json(list);
};

export const onboarding = async (req: Request, res: Response): Promise<Response> => {
  // the consultant sold the enrollment; the ambientação itself is the tutor's work
  if (reqRole(req) === "consultor") throw new AppError("ERR_NO_PERMISSION", 403);
  const lead = await Lead.findByPk(req.params.id);
  if (!lead) throw new AppError("ERR_LEAD_NOT_FOUND", 404);
  const action = req.body.action === "done" ? "done" : "start";
  const { setOnboarding } = await import("../services/CrmServices/EnrollLead");
  const out = await setOnboarding(lead, uid(req), action, String(req.body.note || ""));
  // the conversation of the student, so the tutor goes straight to it
  const conv = lead.contactId ? await Ticket.findOne({ where: { contactId: lead.contactId, segment: "onboarding" }, attributes: ["id"], order: [["id", "DESC"]] }) : null;
  return res.json({ ...(out as any).toJSON(), ticketId: conv ? conv.id : null });
};

// edit a confirmed enrollment: tutor, polo or the step of the onboarding
export const editOnboarding = async (req: Request, res: Response): Promise<Response> => {
  // the consultant sold the enrollment; the ambientação itself is the tutor's work
  if (reqRole(req) === "consultor") throw new AppError("ERR_NO_PERMISSION", 403);
  const lead = await Lead.findByPk(req.params.id);
  if (!lead) throw new AppError("ERR_LEAD_NOT_FOUND", 404);
  const { editOnboarding: edit } = await import("../services/CrmServices/EnrollLead");
  const b = req.body || {};
  const status = ["pending", "started", "done"].includes(b.status) ? b.status : undefined;
  const tutorId = b.tutorId === "auto" ? "auto" : b.tutorId === null ? null : b.tutorId ? Number(b.tutorId) : undefined;
  return res.json(await edit(lead, uid(req), { status, tutorId, poloId: b.poloId ? Number(b.poloId) : undefined }));
};

// The access of the student: what the tutor informs (the academic e-mail the institution created) and what goes to the student by the tutor's WhatsApp.
const accessView = (s: Student) => ({ id: s.id, rgm: s.rgm, academicEmail: s.academicEmail || null, activated: !!s.activatedAt, accessSentAt: s.accessSentAt || null });

const accessStudent = async (req: Request): Promise<{ lead: Lead; student: Student }> => {
  // the consultant sold the enrollment; the access is the tutor's work
  if (reqRole(req) === "consultor") throw new AppError("ERR_NO_PERMISSION", 403);
  const lead = await Lead.findByPk(req.params.id);
  if (!lead) throw new AppError("ERR_LEAD_NOT_FOUND", 404);
  const student = await Student.findOne({ where: { leadId: lead.id } });
  if (!student) throw new AppError("Este aluno ainda não tem cadastro no portal. Confirme a matrícula com o RGM.", 400);
  return { lead, student };
};

// the tutor informs the academic e-mail of access (the one the institution created for the student)
export const onboardingAccessSave = async (req: Request, res: Response): Promise<Response> => {
  const { lead, student } = await accessStudent(req);
  const email = String(req.body?.academicEmail || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 160) throw new AppError("E-mail inválido.", 400);
  if (await Student.findOne({ where: { academicEmail: email, id: { [Op.ne]: student.id } } as any })) throw new AppError("Este e-mail de acesso já é de outro aluno.", 409);
  await student.update({ academicEmail: email, accessSentAt: email === student.academicEmail ? student.accessSentAt : null } as any);
  await addActivity(lead.id, uid(req), "system", `E-mail de acesso do aluno informado: ${email}.`, { kind: "access_email", studentId: student.id, email, actorId: uid(req) });
  getIO().emit("lead", { action: "update", lead: await loadLead(lead.id) });
  return res.json(accessView(student));
};

// the message with the access (RGM, academic e-mail and the link to choose the password of the portal), sent by the tutor's conversation
export const onboardingAccessSend = async (req: Request, res: Response): Promise<Response> => {
  const { lead, student } = await accessStudent(req);
  if (!student.academicEmail) throw new AppError("Informe primeiro o e-mail de acesso do aluno.", 400);
  let ticket = lead.contactId ? await Ticket.findOne({ where: { contactId: lead.contactId, segment: "onboarding", status: { [Op.in]: ["open", "pending"] } } as any, order: [["id", "DESC"]] }) : null;
  // the ambientação conversation was closed: it opens again with the person sending (the access is sent there, not lost)
  if (!ticket && lead.contactId) {
    const closed = await Ticket.findOne({ where: { contactId: lead.contactId, segment: "onboarding" } as any, order: [["id", "DESC"]] });
    if (closed) {
      await closed.update({ status: "open", userId: closed.userId || uid(req) });
      ticket = closed;
    }
  }
  if (!ticket) throw new AppError("ERR_ONBOARDING_NO_CONVERSATION", 400);
  const { issueToken } = await import("../analysis/Store");
  const token = await issueToken(student, student.activatedAt ? "reset" : "invite");
  const base = String(process.env.FRONTEND_URL || "").split(",")[0].trim().replace(/\/$/, "") || "http://localhost:3000";
  const first = String(lead.name || "").trim().split(/\s+/)[0];
  const body = [
    `${first ? `${first}, ` : ""}segue o seu acesso:`,
    "",
    `RGM: ${student.rgm}`,
    `E-mail acadêmico: ${student.academicEmail}`,
    "",
    "Senha: a mesma já utilizada para acessos anteriores, ou use a opção \"esqueci minha senha\" na tela de entrada.",
    "",
    `Para acompanhar a sua situação no portal do aluno, crie a sua senha por este link (vale por 7 dias): ${base}/portal/ativar/${token}`
  ].join("\n");
  const { default: SendWhatsAppMessage } = await import("../services/WbotServices/SendWhatsAppMessage");
  const full = await (await import("../services/TicketServices/ShowTicketService")).default(ticket.id);
  await SendWhatsAppMessage({ body, ticket: full });
  await student.update({ accessSentAt: new Date() } as any);
  const { setChecklist } = await import("../services/CrmServices/EnrollLead");
  if (lead.onboardingStatus !== "none") await setChecklist(lead, uid(req), "access", true).catch(() => undefined);
  await addActivity(lead.id, uid(req), "system", "Acesso enviado ao aluno (RGM, e-mail acadêmico e link do portal).", { kind: "access_sent", studentId: student.id, actorId: uid(req) });
  return res.json(accessView(student));
};

export const onboardingChecklist = async (req: Request, res: Response): Promise<Response> => {
  // the consultant sold the enrollment; the ambientação itself is the tutor's work
  if (reqRole(req) === "consultor") throw new AppError("ERR_NO_PERMISSION", 403);
  const lead = await Lead.findByPk(req.params.id);
  if (!lead) throw new AppError("ERR_LEAD_NOT_FOUND", 404);
  const { setChecklist } = await import("../services/CrmServices/EnrollLead");
  return res.json(await setChecklist(lead, uid(req), String(req.body?.key || ""), req.body?.done !== false));
};

// the numbers of the onboarding for the management: how fast the first contact happens, who is late, how many finish per week, per tutor
// the window of the numbers: semana (7 days), mês (this month), ciclo (the semester: the goal running today, e.g. 2027.1 from 17/11 to
// 03/05; without one, the calendar half-year) or the last 90 days (the default)
// `from`/`to` (YYYY-MM-DD): the two dates the screen chose (today, the week, the month, a range or the cycle); without them the named
// periods of before still work
const periodStart = async (period: string, from?: string, to?: string): Promise<{ since: number; until?: number; label: string }> => {
  const now = new Date();
  const dayRe = /^\d{4}-\d{2}-\d{2}$/;
  if (from && to && dayRe.test(from) && dayRe.test(to) && from <= to) {
    const br = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
    return { since: dayBounds(from).start.getTime(), until: dayBounds(to).end.getTime(), label: from === to ? `em ${br(from)}` : `de ${br(from)} a ${br(to)}` };
  }
  if (period === "semana") return { since: now.getTime() - 7 * 86400000, label: "últimos 7 dias" };
  if (period === "mes") return { since: new Date(now.getFullYear(), now.getMonth(), 1).getTime(), label: "este mês" };
  if (period === "ciclo") {
    const { default: Goal } = await import("../models/Goal");
    const today = now.toISOString().slice(0, 10);
    const goals = await Goal.findAll({ where: { startsOn: { [Op.lte]: today }, endsOn: { [Op.gte]: today } } as any, attributes: ["title", "startsOn", "endsOn"] });
    const longest = goals.sort((a, b) => (+new Date(b.endsOn) - +new Date(b.startsOn)) - (+new Date(a.endsOn) - +new Date(a.startsOn)))[0];
    if (longest) return { since: new Date(`${longest.startsOn}T00:00:00`).getTime(), label: `ciclo ${longest.title}` };
    return { since: new Date(now.getFullYear(), now.getMonth() < 6 ? 0 : 6, 1).getTime(), label: "este semestre" };
  }
  return { since: now.getTime() - 90 * 86400000, label: "últimos 90 dias" };
};

export const onboardingStats = async (req: Request, res: Response): Promise<Response> => {
  const role = reqRole(req);
  const manager = isManagerRole(role);
  // a tutor sees only their own students; the management sees everybody
  if (!manager && !["tutor", "academico"].includes(role)) throw new AppError("ERR_NO_PERMISSION", 403);
  const { since: periodSince, until: periodUntil = Number.MAX_SAFE_INTEGER, label: periodLabel } = await periodStart(String(req.query.period || ""), req.query.from ? String(req.query.from) : undefined, req.query.to ? String(req.query.to) : undefined);
  const slaHours = Math.max(1, Number(await getSetting("onboarding_sla_hours", "24")) || 24);
  const polos = manager ? await crmPolosOf(req) : null;
  const rows = await Lead.findAll({
    where: { onboardingStatus: { [Op.ne]: "none" }, enrolledAt: { [Op.ne]: null }, ...(manager ? {} : { onboardingTutorId: uid(req) }), ...(polos ? { poloId: { [Op.in]: polos.length ? polos : [0] } } : {}) } as any,
    attributes: ["id", "onboardingStatus", "onboardingTutorId", "enrolledAt", "onboardingStartedAt", "onboardingDoneAt"],
    order: [["enrolledAt", "DESC"]],
    limit: 5000
  });
  const now = Date.now();
  const H = 3600000;
  const since90 = periodSince;
  const firstContact = (r: Lead): number | null => (r.onboardingStartedAt && r.enrolledAt ? Math.max(0, (+new Date(r.onboardingStartedAt) - +new Date(r.enrolledAt)) / H) : null);
  const avg = (xs: number[]): number | null => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);
  const recent = rows.filter(r => r.enrolledAt && +new Date(r.enrolledAt) >= since90 && +new Date(r.enrolledAt) <= periodUntil);
  const pending = rows.filter(r => r.onboardingStatus === "pending");
  const late = pending.filter(r => now - +new Date(r.enrolledAt) > slaHours * H);
  const within = recent.map(firstContact).filter((x): x is number => x !== null);
  // the Monday of each of the last 8 weeks, and how many students finished in it
  const monday = (t: number): number => {
    const d = new Date(t);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d.getTime();
  };
  const weeks: Array<{ weekStart: string; done: number }> = [];
  for (let i = 7; i >= 0; i -= 1) {
    const start = monday(now - i * 7 * 24 * H);
    const end = start + 7 * 24 * H;
    weeks.push({ weekStart: new Date(start).toISOString().slice(0, 10), done: rows.filter(r => r.onboardingDoneAt && +new Date(r.onboardingDoneAt) >= start && +new Date(r.onboardingDoneAt) < end).length });
  }
  const tutorIds = [...new Set(rows.map(r => r.onboardingTutorId).filter(Boolean))] as number[];
  const users = tutorIds.length ? await User.findAll({ where: { id: tutorIds }, attributes: ["id", "name"] }) : [];
  const byTutor = tutorIds
    .map(id => {
      const mine = rows.filter(r => r.onboardingTutorId === id);
      return {
        tutorId: id,
        name: users.find(u => u.id === id)?.name || "",
        active: mine.filter(r => r.onboardingStatus !== "done").length,
        late: mine.filter(r => r.onboardingStatus === "pending" && now - +new Date(r.enrolledAt) > slaHours * H).length,
        doneLast30: mine.filter(r => r.onboardingDoneAt && now - +new Date(r.onboardingDoneAt) <= 30 * 24 * H).length,
        avgFirstContactHours: avg(mine.filter(r => r.enrolledAt && +new Date(r.enrolledAt) >= since90 && +new Date(r.enrolledAt) <= periodUntil).map(firstContact).filter((x): x is number => x !== null))
      };
    })
    .sort((a, b) => b.active - a.active);
  return res.json({
    slaHours,
    period: periodLabel,
    scope: manager ? "all" : "mine",
    doneInPeriod: rows.filter(r => r.onboardingDoneAt && +new Date(r.onboardingDoneAt) >= periodSince && +new Date(r.onboardingDoneAt) <= periodUntil).length,
    enrolledInPeriod: recent.length,
    totals: { pending: pending.length, started: rows.filter(r => r.onboardingStatus === "started").length, done: rows.filter(r => r.onboardingStatus === "done").length, late: late.length, withoutTutor: rows.filter(r => !r.onboardingTutorId && r.onboardingStatus !== "done").length },
    avgFirstContactHours: avg(within),
    withinSlaShare: within.length ? Math.round((within.filter(h => h <= slaHours).length / within.length) * 100) : null,
    weeks,
    byTutor
  });
};

// how many students wait for the first contact of the person (the badge of the menu)
export const onboardingPending = async (req: Request, res: Response): Promise<Response> => {
  // a tutor counts their own students and the ones of their polos still without a tutor (the scope decides which); a consultant, theirs
  const mine = reqRole(req) === "consultor" ? { ownerId: uid(req) } : {};
  const total = await Lead.count({ where: await withOnboardingScope(req, { onboardingStatus: "pending", ...mine }) });
  return res.json({ pending: total });
};

// the deadline of the first contact of the ambientação (the screen reads it instead of assuming 24 hours)
export const onboardingRules = async (_req: Request, res: Response): Promise<Response> => {
  const { getSetting } = await import("../helpers/AppSettings");
  return res.json({ slaHours: Math.max(1, Number(await getSetting("onboarding_sla_hours", "24")) || 24) });
};

export const onboardingList = async (req: Request, res: Response): Promise<Response> => {
  const { parseChecklist } = await import("../services/CrmServices/EnrollLead");
  const rows = await Lead.findAll({
    // a consultant sees only the students THEY sent to the ambientação; tutors see theirs (and the polo's queue), the management everyone
    // the board is the work of the ambientação: the concluded ones only of the last 30 days, and never the students imported into a tutor's
    // list (they arrive concluded, with no ambientação of their own, and used to fill the board)
    where: await withOnboardingScope(req, {
      onboardingStatus: { [Op.ne]: "none" },
      ...(reqRole(req) === "consultor" ? { ownerId: uid(req) } : {}),
      [Op.or]: [{ onboardingStatus: { [Op.ne]: "done" } }, { onboardingDoneAt: { [Op.gte]: new Date(Date.now() - 30 * 864e5) } }]
    }),
    include: leadInclude as any,
    order: [["enrolledAt", "DESC"]],
    limit: 300
  });
  // tutor names and the onboarding conversation, so the board needs no extra calls
  const tutorIds = [...new Set(rows.map(r => r.onboardingTutorId).filter(Boolean))];
  const tutors = tutorIds.length ? await User.findAll({ where: { id: tutorIds }, attributes: ["id", "name"] }) : [];
  const contactIds = rows.map(r => r.contactId).filter(Boolean);
  const tickets = contactIds.length
    ? await Ticket.findAll({ where: { contactId: contactIds, segment: "onboarding" }, attributes: ["id", "contactId", "status", "unreadMessages", "lastMessageAt", "userId"], order: [["id", "DESC"]] })
    : [];
  const students = rows.length ? await Student.findAll({ where: { leadId: rows.map(r => r.id) } as any }) : [];
  return res.json(
    rows.map(r => ({
      ...r.toJSON(),
      tutorName: tutors.find(t => t.id === r.onboardingTutorId)?.name || null,
      onboardingChecklist: undefined,
      checklist: parseChecklist(r.onboardingChecklist),
      student: students.find(x => x.leadId === r.id) ? accessView(students.find(x => x.leadId === r.id) as Student) : null,
      ticketId: tickets.find(t => t.contactId === r.contactId)?.id || null,
      unread: tickets.find(t => t.contactId === r.contactId)?.unreadMessages || 0,
      lastMessageAt: tickets.find(t => t.contactId === r.contactId)?.lastMessageAt || null
    }))
  );
};

// runs the follow-ups now (the worker does it every ten minutes): useful to see the result of a new trigger
export const runCadencesNow = async (_req: Request, res: Response): Promise<Response> => res.json(await runCadences());

// ------------------------------------------------ documents of the student
export const documents = async (req: Request, res: Response): Promise<Response> => {
  const lead = await Lead.findByPk(req.params.id);
  if (!lead) throw new AppError("ERR_LEAD_NOT_FOUND", 404);
  return res.json(await listDocuments(lead.id));
};

export const setDocument = async (req: Request, res: Response): Promise<Response> => {
  const lead = await Lead.findByPk(req.params.id);
  if (!lead) throw new AppError("ERR_LEAD_NOT_FOUND", 404);
  const summary = await setDocumentStatus(lead, Number(req.params.docId), String(req.body.status || ""), uid(req), req.body.note);
  return res.json({ ...(await listDocuments(lead.id)), summary });
};

export const remindDocs = async (req: Request, res: Response): Promise<Response> => {
  const lead = await Lead.findByPk(req.params.id);
  if (!lead) throw new AppError("ERR_LEAD_NOT_FOUND", 404);
  const sent = await remindDocuments(lead, uid(req));
  return res.json({ ok: true, missing: sent });
};
