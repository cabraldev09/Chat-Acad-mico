import { touchAnalytics } from "../services/AnalyticsServices/Realtime";
import { assertLead, isAdminReq } from "../middleware/scope";
import { Request, Response } from "express";
import { PUBLIC_DIR } from "../config/paths";
import fs from "fs";
import path from "path";
import { Op } from "sequelize";
import { randomBytes } from "crypto";

import Affiliate from "../models/Affiliate";
import Lead from "../models/Lead";
import { leadScopeWhere } from "../middleware/scope";
import LeadStage from "../models/LeadStage";
import Course from "../models/Course";
import Institution from "../models/Institution";
import ProposalTemplate from "../models/ProposalTemplate";
import Proposal from "../models/Proposal";
import User from "../models/User";
import AppError from "../errors/AppError";
import { getPublicUrl } from "../helpers/PublicUrl";
import { getIO } from "../libs/socket";
import SendToContact from "../services/ChannelServices/SendToContact";
import { addActivity, changeStage, loadLead, resolveLeadTarget } from "../services/CrmServices/LeadCore";
import dispatchWebhook from "../services/WebhookServices/DispatchWebhook";
import { baseMonthly, calcProposal, ProposalParams, SemestralStep } from "../services/ProposalServices/calc";
import { renderProposalHtml } from "../services/ProposalServices/render";
import { buildProposalMessages } from "../services/ProposalServices/proposalMessage";
import ProposalTemplateInstitution from "../models/ProposalTemplateInstitution";
import { renderPdf } from "../services/ProposalServices/pdf";
import makeCrud from "./crudFactory";
import { markMilestone } from "../services/CommercialServices/Milestones";
import { dueDatesOf, EntryTurma, getEntryCalendar, startOf, turmaFor } from "../services/CrmServices/EntryCalendar";
import { todayInAppTz } from "../helpers/AppTime";


const uid = (req: Request) => Number(req.user.id);
const num = (v: any, d = 0) => (v === undefined || v === null || v === "" || Number.isNaN(Number(v)) ? d : Number(v));

interface Snapshot {
  title: string;
  modalityLabel?: string;
  texts: { bolsaNote?: string | null; observation?: string | null; disclaimer?: string | null; finalMessage?: string | null; waIntro?: string | null; waClosing?: string | null };
  institutionId?: number | null;
}

const parseSchedule = (v: any): SemestralStep[] => {
  try {
    const arr = typeof v === "string" ? JSON.parse(v) : v;
    return (Array.isArray(arr) ? arr : [])
      .map((s: any) => ({ from: num(s.from, 2), pct: num(s.pct, 0) }))
      .filter((s: SemestralStep) => s.from >= 2);
  } catch (e) {
    return [];
  }
};

// explicit choice, else a model made for the course's institution (default one first),
// else the default model of the system
const defaultTemplate = async (id?: number | null, institutionId?: number | null) => {
  // a model chosen by id is used even when inactive (a draft made with it keeps working); the automatic choice skips inactive ones
  if (id) {
    const chosen = await ProposalTemplate.findByPk(id);
    if (chosen) return chosen;
  }
  const active = { active: true };
  if (institutionId) {
    const links = await ProposalTemplateInstitution.findAll({ where: { institutionId } });
    const ids = links.map(l => l.templateId);
    const own =
      (ids.length &&
        ((await ProposalTemplate.findOne({ where: { id: ids, isDefault: true, ...active } })) ||
          (await ProposalTemplate.findOne({ where: { id: ids, ...active }, order: [["name", "ASC"]] })))) ||
      (await ProposalTemplate.findOne({ where: { institutionId, ...active }, order: [["name", "ASC"]] }));
    if (own) return own;
  }
  return (
    (await ProposalTemplate.findOne({ where: { isDefault: true, ...active } })) ||
    (await ProposalTemplate.findOne({ where: active, order: [["id", "ASC"]] })) ||
    (await ProposalTemplate.findOne({ order: [["id", "ASC"]] }))
  );
};

const defaultStart = (entryTerm?: string | null) => {
  const m = String(entryTerm || "").match(/(20\d{2})\s*[./-]\s*([12])/);
  if (m) return { startYear: Number(m[1]), startSemester: Number(m[2]) as 1 | 2 };
  const now = new Date();
  return { startYear: now.getFullYear(), startSemester: (now.getMonth() < 6 ? 1 : 2) as 1 | 2 };
};

const modalityLabel = (c?: Course | null) =>
  c ? [c.modality, c.category || c.level].filter(Boolean).join(" - ") : undefined;

// Everything the studio needs to start: course price, template rules, calendar. The class of the entry calendar comes from the day
// of the enrollment (today), unless the studio asks for another one; it sets the period, the installments of the first semester and
// the due date of the 1st monthly fee (the boleto deadline of the class).
const buildDefaults = async (lead: Lead, courseId?: number | null, templateId?: number | null, turmaKey?: string | null) => {
  const course = courseId ? await Course.findByPk(courseId) : lead.courseId ? await Course.findByPk(lead.courseId) : null;
  // the university of the proposal: the one of the course, else the one of the lead (the number it came through)
  const ownInstitution = course?.institutionId || lead.institutionId || null;
  const tpl = await defaultTemplate(templateId, ownInstitution);
  if (!tpl) throw new AppError("ERR_NO_PROPOSAL_TEMPLATE");
  const gross = course?.monthlyFee ? Number(course.monthlyFee) : 0;
  const calendar = await getEntryCalendar();
  const turma: EntryTurma | null =
    turmaKey === "" ? null : (turmaKey && calendar.find(t => t.key === turmaKey)) || turmaFor(calendar, todayInAppTz());
  const params: ProposalParams = {
    gross,
    // the monthly fee with the scholarship; the 1st installment starts the same (a model that waives it sets firstExempt, and the
    // saving makes it R$ 0). "monthly" is left out here: a caller that changes only firstMonthly keeps meaning every installment
    firstMonthly: gross ? Math.round(gross * 0.2 * 100) / 100 : 0,
    enrollmentFee: Number(tpl.enrollmentFee),
    dueDay: tpl.dueDay,
    installments: tpl.installments,
    courseSemesters: course?.semesters || 8,
    entrySemester: Math.min(lead.entrySemester || 1, course?.semesters || 8),
    admissionType: lead.admissionType || null,
    extraSemesters: lead.extraSemesters || 0,
    semesters:
      (course?.semesters || 8) - Math.min(lead.entrySemester || 1, course?.semesters || 8) + 1 + (lead.extraSemesters || 0),
    ...defaultStart(lead.entryTerm),
    bolsaFirst: Number(tpl.bolsaFirst),
    bolsaNext: Number(tpl.bolsaNext),
    punctualityPct: tpl.punctualityPct,
    lateFee1Pct: tpl.lateFee1Pct,
    lateFee2Pct: tpl.lateFee2Pct,
    annualMin: Number(tpl.annualMin),
    annualMax: Number(tpl.annualMax),
    semestralSchedule: parseSchedule(tpl.semestralSchedule),
    projectionFrom: null,
    projectionTo: null,
    firstDueDate: null,
    hasRegression: tpl.hasRegression !== false,
    hasAdjustment: tpl.hasAdjustment !== false,
    fixedUntilEnd: !!tpl.fixedUntilEnd,
    installmentsFixed: tpl.installmentsFixed || null,
    firstExempt: !!tpl.firstExempt,
    secondDueDate: null,
    entryTurma: null,
    releaseDate: null
  };
  if (turma) {
    Object.assign(params, startOf(turma), dueDatesOf(turma, params.dueDay), { installments: turma.installments, entryTurma: turma.name, releaseDate: turma.releaseDate || null });
  }
  const institutionId = ownInstitution || tpl.institutionId || null;
  const snapshot: Snapshot = {
    title: course?.name || lead.name,
    modalityLabel: modalityLabel(course),
    texts: { bolsaNote: tpl.bolsaNote, observation: tpl.observation, disclaimer: tpl.disclaimer, finalMessage: tpl.finalMessage, waIntro: tpl.waIntro, waClosing: tpl.waClosing },
    institutionId
  };
  return { course, tpl, params, snapshot, calendar, turma };
};

const normalizeParams = (base: ProposalParams, raw: any = {}): ProposalParams => {
  const p: ProposalParams = {
    gross: num(raw.gross, base.gross),
    // the monthly fee with the scholarship; a caller that only knows "firstMonthly" (the API before the 1st installment had its own value)
    // means the same value for every installment
    monthly: num(raw.monthly, raw.monthly === undefined && raw.firstMonthly !== undefined ? num(raw.firstMonthly, 0) : baseMonthly(base)),
    firstMonthly: num(raw.firstMonthly, base.firstMonthly),
    enrollmentFee: num(raw.enrollmentFee, base.enrollmentFee),
    dueDay: Math.min(28, Math.max(1, num(raw.dueDay, base.dueDay))),
    installments: Math.max(1, Math.round(num(raw.installments, base.installments))),
    courseSemesters: Math.min(20, Math.max(1, Math.round(num(raw.courseSemesters, num(raw.semesters, base.courseSemesters || 8))))),
    entrySemester: 1,
    extraSemesters: 0,
    admissionType: raw.admissionType !== undefined ? raw.admissionType || null : base.admissionType || null,
    semesters: 1,
    startYear: Math.round(num(raw.startYear, base.startYear)),
    startSemester: (num(raw.startSemester, base.startSemester) === 1 ? 1 : 2) as 1 | 2,
    bolsaFirst: num(raw.bolsaFirst, base.bolsaFirst),
    bolsaNext: num(raw.bolsaNext, base.bolsaNext),
    punctualityPct: num(raw.punctualityPct, base.punctualityPct),
    lateFee1Pct: num(raw.lateFee1Pct, base.lateFee1Pct),
    lateFee2Pct: num(raw.lateFee2Pct, base.lateFee2Pct),
    annualMin: num(raw.annualMin, base.annualMin),
    annualMax: num(raw.annualMax, base.annualMax),
    semestralSchedule: raw.semestralSchedule ? parseSchedule(raw.semestralSchedule) : base.semestralSchedule,
    projectionFrom: null,
    projectionTo: null,
    firstDueDate: raw.firstDueDate !== undefined ? raw.firstDueDate || null : base.firstDueDate || null,
    hasRegression: raw.hasRegression === undefined ? base.hasRegression !== false : !!raw.hasRegression,
    hasAdjustment: raw.hasAdjustment === undefined ? base.hasAdjustment !== false : !!raw.hasAdjustment,
    fixedUntilEnd: raw.fixedUntilEnd === undefined ? !!base.fixedUntilEnd : !!raw.fixedUntilEnd,
    installmentsFixed:
      raw.installmentsFixed === undefined ? base.installmentsFixed || null : num(raw.installmentsFixed, 0) > 0 ? Math.round(num(raw.installmentsFixed, 0)) : null,
    firstExempt: raw.firstExempt === undefined ? !!base.firstExempt : !!raw.firstExempt,
    secondDueDate: raw.secondDueDate !== undefined ? raw.secondDueDate || null : base.secondDueDate || null,
    entryTurma: raw.entryTurma !== undefined ? String(raw.entryTurma || "").trim().slice(0, 40) || null : base.entryTurma || null,
    releaseDate: raw.releaseDate !== undefined ? (/^\d{4}-\d{2}-\d{2}$/.test(String(raw.releaseDate)) ? String(raw.releaseDate) : null) : base.releaseDate || null
  };
  ["firstDueDate", "secondDueDate"].forEach(k => {
    if ((p as any)[k] && !/^\d{4}-\d{2}-\d{2}$/.test(String((p as any)[k]))) (p as any)[k] = null;
  });
  // the projection covers only the semesters still to be attended
  p.entrySemester = Math.min(
    p.courseSemesters || 1,
    Math.max(1, Math.round(num(raw.entrySemester, base.entrySemester || 1)))
  );
  // what the curriculum still requires, plus extra semesters the candidate may need
  // (the total can go beyond the course's own length)
  p.extraSemesters = Math.min(10, Math.max(0, Math.round(num(raw.extraSemesters, base.extraSemesters || 0))));
  const remaining = (p.courseSemesters || 1) - p.entrySemester + 1;
  p.semesters = Math.min(20, remaining + p.extraSemesters);
  // the consultant can set the total directly (e.g. credits validated => fewer, dependencies => more)
  if (raw.attendSemesters !== undefined && raw.attendSemesters !== null && Number(raw.attendSemesters) > 0) {
    p.semesters = Math.min(20, Math.max(1, Math.round(Number(raw.attendSemesters))));
    p.extraSemesters = Math.max(0, p.semesters - remaining);
  }
  if (!(p.gross > 0)) throw new AppError("ERR_PROPOSAL_NO_GROSS");
  if (!(Number(p.monthly) > 0) || Number(p.monthly) > p.gross) throw new AppError("ERR_PROPOSAL_FIRST_MONTHLY");
  // the 1st installment: the value the consultant typed (0 means waived), never above the gross fee
  // not typed: it follows the others (as it did before), unless it had its own value
  if (raw.firstMonthly === undefined && !p.firstExempt) {
    const own = Number(base.firstMonthly) > 0 && Math.abs(Number(base.firstMonthly) - baseMonthly(base)) >= 0.01;
    p.firstMonthly = own ? Number(base.firstMonthly) : Number(p.monthly);
  }
  if (!(p.firstMonthly >= 0) || p.firstMonthly > p.gross) throw new AppError("ERR_PROPOSAL_FIRST_PAYMENT");
  if (p.firstMonthly === 0) p.firstExempt = true;
  if (p.firstExempt) p.firstMonthly = 0;
  return p;
};

// The gross monthly fee is the course's price and the consultant cannot change it. The management (admin, coordination) may unlock it
// and type another value; a value they unlocked stays when a consultant edits the draft later. Without a course there is nothing to
// lock (the draft is only a simulation and cannot be sent); a course without a price needs the management.
const lockedGross = (req: Request, d: { course: Course | null; params: ProposalParams }, raw: any = {}, before?: ProposalParams | null) => {
  const manager = isAdminReq(req);
  const coursePrice = d.params.gross;
  if (manager && raw.grossUnlocked) return { gross: num(raw.gross, coursePrice), unlocked: true };
  if (!manager && before?.grossUnlocked) return { gross: Number(before.gross), unlocked: true };
  if (coursePrice > 0) return { gross: coursePrice, unlocked: false };
  if (!d.course) return { gross: num(raw.gross, 0), unlocked: false };
  if (!manager) throw new AppError("ERR_PROPOSAL_COURSE_NO_PRICE");
  return { gross: num(raw.gross, 0), unlocked: true };
};

const paramsFor = (req: Request, d: { course: Course | null; params: ProposalParams }, raw: any = {}, before?: ProposalParams | null): ProposalParams => {
  const lock = lockedGross(req, d, raw || {}, before);
  const params = normalizeParams(d.params, { ...(raw || {}), gross: lock.gross });
  params.grossUnlocked = lock.unlocked;
  return params;
};

// the WhatsApp blocks the consultant edited, kept with the draft: { intro: "…", summary: "…" }
const cleanBlocks = (v: any): Record<string, string> | null => {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const out: Record<string, string> = {};
  Object.entries(v).slice(0, 10).forEach(([k, text]) => {
    if (/^[a-z]{1,20}$/.test(k) && typeof text === "string") out[k] = text.slice(0, 4000);
  });
  return out;
};

// what a proposal must say before it is generated (PDF) or sent: the form of admission, the course and the deadlines.
// A draft saves without them, so the consultant can leave and come back.
export const missingOf = (p: { courseId?: number | null }, params: Partial<ProposalParams>): string | null => {
  if (!params.admissionType) return "ERR_PROPOSAL_NEEDS_ADMISSION";
  if (!p.courseId) return "ERR_PROPOSAL_NEEDS_COURSE";
  if (!(params.firstExempt ? params.secondDueDate || params.firstDueDate : params.firstDueDate)) return "ERR_PROPOSAL_NEEDS_DUE_DATE";
  return null;
};
const assertReady = (p: Proposal) => {
  const { params } = JSON.parse(p.params || "{}");
  const missing = missingOf(p, params || {});
  if (missing) throw new AppError(missing);
};

const compose = async (lead: Lead, params: ProposalParams, snapshot: Snapshot, generatedAt = new Date()) => {
  const institution = snapshot.institutionId ? await Institution.findByPk(snapshot.institutionId) : null;
  const result = calcProposal(params);
  const messages = buildProposalMessages({
    leadName: lead.name,
    courseName: snapshot.title,
    modalityLabel: snapshot.modalityLabel,
    params,
    result,
    generatedAt,
    intro: snapshot.texts.waIntro,
    closing: snapshot.texts.waClosing
  });
  const html = renderProposalHtml({
    title: snapshot.title,
    modalityLabel: snapshot.modalityLabel,
    leadName: lead.name,
    institution,
    params,
    result,
    texts: snapshot.texts,
    generatedAt
  });
  return { result, html, institution, messages };
};

const link = (p: Proposal) => `${getPublicUrl()}/p/${p.token}`;
// who referred the student: proposals carry the affiliate so the team can follow what each one brings
const affiliateNames = async (ids: Array<number | null | undefined>): Promise<Map<number, string>> => {
  const list = Array.from(new Set(ids.filter(Boolean) as number[]));
  const rows = list.length ? await Affiliate.findAll({ where: { id: list }, attributes: ["id", "name"] }) : [];
  return new Map(rows.map(a => [a.id, a.name]));
};

const present = (p: Proposal) => ({ ...p.toJSON(), params: JSON.parse(p.params), link: link(p) });
// the class and period of a proposal, for the list of the lead
const entryOf = (p: Proposal) => {
  try {
    const { params } = JSON.parse(p.params);
    return params ? { turma: params.entryTurma || null, term: params.startYear ? `${params.startYear}/${params.startSemester}` : null, firstDueDate: params.firstDueDate || null } : null;
  } catch (e) {
    return null;
  }
};

// ---------------------------------------------------------------------------

export const defaults = async (req: Request, res: Response): Promise<Response> => {
  await assertLead(req, String(req.query.leadId));
  const lead = await Lead.findByPk(String(req.query.leadId));
  if (!lead) throw new AppError("ERR_LEAD_NOT_FOUND", 404);
  const { params, snapshot, tpl, course, calendar, turma } = await buildDefaults(
    lead,
    req.query.courseId ? Number(req.query.courseId) : null,
    req.query.templateId ? Number(req.query.templateId) : null,
    req.query.turma !== undefined ? String(req.query.turma) : null
  );
  params.grossUnlocked = false;
  return res.json({
    params, snapshot, templateId: tpl.id, courseId: course ? course.id : null,
    calendar, turmaKey: turma ? turma.key : "",
    // the price of the course locks the gross fee; only the management may unlock it
    coursePrice: course?.monthlyFee ? Number(course.monthlyFee) : null,
    canUnlockGross: isAdminReq(req)
  });
};

export const preview = async (req: Request, res: Response): Promise<Response> => {
  const { leadId, courseId, templateId, params: raw, snapshot: snapRaw } = req.body;
  await assertLead(req, leadId);
  const lead = await Lead.findByPk(leadId);
  if (!lead) throw new AppError("ERR_LEAD_NOT_FOUND", 404);
  const d = await buildDefaults(lead, courseId, templateId);
  const before = req.body.proposalId ? await Proposal.findByPk(req.body.proposalId, { attributes: ["id", "leadId", "courseId", "params"] }) : null;
  const sameDraft = before && before.leadId === lead.id && before.courseId === (d.course ? d.course.id : null);
  const params = paramsFor(req, d, raw, sameDraft ? JSON.parse(before.params || "{}").params : null);
  const snapshot: Snapshot = {
    ...d.snapshot,
    ...(snapRaw && typeof snapRaw === "object" ? { texts: { ...d.snapshot.texts, ...(snapRaw.texts || {}) }, institutionId: snapRaw.institutionId ?? d.snapshot.institutionId } : {})
  };
  const { result, html, messages } = await compose(lead, params, snapshot);
  return res.json({ result, html, messages, gross: params.gross, grossUnlocked: !!params.grossUnlocked, missing: missingOf({ courseId: d.course ? d.course.id : null }, params) });
};

const save = async (req: Request, existing?: Proposal) => {
  const { leadId, courseId, templateId, params: raw, snapshot: snapRaw } = req.body;
  await assertLead(req, existing ? existing.leadId : leadId);
  const lead = await Lead.findByPk(existing ? existing.leadId : leadId);
  if (!lead) throw new AppError("ERR_LEAD_NOT_FOUND", 404);
  // the course and the model the studio shows now (they may have changed since the first save)
  const d = await buildDefaults(
    lead,
    courseId !== undefined ? courseId : existing ? existing.courseId : null,
    templateId !== undefined ? templateId : existing ? existing.templateId : null
  );
  const stored = existing ? JSON.parse(existing.params || "{}") : {};
  // a value the management unlocked holds for the same course; another course brings its own price
  const sameCourse = !!existing && existing.courseId === (d.course ? d.course.id : null);
  const params = paramsFor(req, d, raw, sameCourse ? stored.params || null : null);
  const blocks = req.body.messageBlocks !== undefined ? cleanBlocks(req.body.messageBlocks) : stored.blocks || null;
  const snapshot: Snapshot = {
    ...d.snapshot,
    ...(snapRaw && typeof snapRaw === "object" ? { texts: { ...d.snapshot.texts, ...(snapRaw.texts || {}) }, institutionId: snapRaw.institutionId ?? d.snapshot.institutionId } : {})
  };
  const result = calcProposal(params);
  const data: any = {
    courseName: snapshot.title,
    grossFee: params.gross,
    // the column keeps the monthly fee with the scholarship (what reports and the affiliate bonus read)
    firstMonthly: baseMonthly(params),
    bolsaPct: result.bolsaApplied,
    params: JSON.stringify({ params, snapshot, ...(blocks && Object.keys(blocks).length ? { blocks } : {}) }),
    courseId: d.course ? d.course.id : null,
    templateId: d.tpl.id,
    institutionId: snapshot.institutionId || null
  };
  // what the proposal settled also fills the lead, where it is still empty
  const fill: any = {};
  if (!lead.admissionType && params.admissionType) fill.admissionType = params.admissionType;
  if (!lead.courseId && d.course) fill.courseId = d.course.id;
  if (!lead.entryTerm && params.startYear) fill.entryTerm = `${params.startYear}/${params.startSemester}`;
  if (Object.keys(fill).length) await lead.update(fill);
  if (existing) {
    await existing.update(data);
    return existing;
  }
  return Proposal.create({ ...data, leadId: lead.id, affiliateId: lead.affiliateId || null, token: randomBytes(18).toString("hex"), createdBy: uid(req), status: "draft" });
};

const rebuild = async (p: Proposal) => {
  const lead = (await Lead.findByPk(p.leadId)) as Lead;
  const { params, snapshot } = JSON.parse(p.params);
  return compose(lead, params, snapshot, p.createdAt);
};

export const store = async (req: Request, res: Response): Promise<Response> => {
  const p = await save(req);
  await addActivity(p.leadId, uid(req), "system", `Proposta #${p.id} criada (${p.courseName}, mensalidade com bolsa ${Number(p.firstMonthly).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })})`);
  getIO().emit("lead", { action: "update", lead: await loadLead(p.leadId) });
  return res.status(201).json(present(p));
};

export const update = async (req: Request, res: Response): Promise<Response> => {
  const existing = await Proposal.findByPk(req.params.id);
  if (!existing) throw new AppError("ERR_NOT_FOUND", 404);
  if (existing.status !== "draft") throw new AppError("ERR_PROPOSAL_ALREADY_SENT");
  return res.json(present(await save(req, existing)));
};

export const index = async (req: Request, res: Response): Promise<Response> => {
  const scope = await leadScopeWhere(req);
  const allowed = scope
    ? (await Lead.findAll({ where: scope, attributes: ["id"], limit: 5000 })).map(l => l.id)
    : null;
  const rows = await Proposal.findAll({
    where: {
      ...(req.query.leadId ? { leadId: Number(req.query.leadId) } : {}),
      ...(allowed ? { leadId: req.query.leadId ? { [Op.and]: [Number(req.query.leadId), { [Op.in]: allowed }] } : { [Op.in]: allowed } } : {})
    },
    include: [{ model: User, as: "author", attributes: ["id", "name"] }],
    order: [["id", "DESC"]],
    limit: 100
  });
  const names = await affiliateNames(rows.map(r => r.affiliateId));
  return res.json(rows.map(r => ({ ...r.toJSON(), params: undefined, entry: entryOf(r), link: link(r), affiliate: r.affiliateId ? { id: r.affiliateId, name: names.get(r.affiliateId) || null } : null })));
};

export const show = async (req: Request, res: Response): Promise<Response> => {
  const p = await Proposal.findByPk(req.params.id);
  if (!p) throw new AppError("ERR_NOT_FOUND", 404);
  const { html, result, messages } = await rebuild(p);
  const names = await affiliateNames([p.affiliateId]);
  return res.json({ ...present(p), html, result, messages, affiliate: p.affiliateId ? { id: p.affiliateId, name: names.get(p.affiliateId) || null } : null });
};

export const duplicate = async (req: Request, res: Response): Promise<Response> => {
  const p = await Proposal.findByPk(req.params.id);
  if (!p) throw new AppError("ERR_NOT_FOUND", 404);
  const copy = await Proposal.create({
    courseName: p.courseName, grossFee: p.grossFee, firstMonthly: p.firstMonthly, bolsaPct: p.bolsaPct, params: p.params,
    courseId: p.courseId, templateId: p.templateId, institutionId: p.institutionId, leadId: p.leadId,
    token: randomBytes(18).toString("hex"), createdBy: uid(req), status: "draft"
  } as any);
  return res.status(201).json(present(copy));
};

export const remove = async (req: Request, res: Response): Promise<Response> => {
  const p = await Proposal.findByPk(req.params.id);
  if (!p) throw new AppError("ERR_NOT_FOUND", 404);
  // a proposal the candidate received is part of the history of the lead; only the management removes it
  if (p.status !== "draft" && !isAdminReq(req)) throw new AppError("ERR_PROPOSAL_ALREADY_SENT", 403);
  await p.destroy();
  return res.json({ message: "deleted" });
};

const pdfName = (name: string) => `Proposta - ${name.replace(/[\\/:*?"<>|]/g, "").trim()}.pdf`;

export const pdf = async (req: Request, res: Response): Promise<Response> => {
  const p = await Proposal.findByPk(req.params.id, { include: [{ model: Lead, as: "lead", attributes: ["name"] }] });
  if (!p) throw new AppError("ERR_NOT_FOUND", 404);
  if (p.status === "draft") assertReady(p);
  const { html } = await rebuild(p);
  const buf = await renderPdf(html);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(pdfName(p.lead.name))}`);
  return res.send(buf);
};

export const send = async (req: Request, res: Response): Promise<Response> => {
  const p = await Proposal.findByPk(req.params.id);
  if (!p) throw new AppError("ERR_NOT_FOUND", 404);
  assertReady(p);
  const lead = (await Lead.findByPk(p.leadId)) as Lead;
  const { html, messages } = await rebuild(p);
  const buf = await renderPdf(html);

  // the file lives in /public so every channel can upload it
  const file = `proposta-${p.id}-${Date.now()}.pdf`;
  fs.writeFileSync(path.join(PUBLIC_DIR, file), buf);

  const { contact, whatsapp } = await resolveLeadTarget(lead, uid(req), req.body.whatsappId);
  // the consultant may have edited the blocks; the legacy single "message" still works
  const edited: string[] = Array.isArray(req.body.messages)
    ? req.body.messages.map((m: any) => String(m || "").trim())
    : [];
  const blocks = (edited.length ? edited : messages.map(m => m.text)).filter(Boolean);
  const legacy = req.body.message ? String(req.body.message).trim() : "";
  const keepOpen = { userId: uid(req) };
  try {
    if (legacy) {
      await SendToContact({ contact, whatsapp, body: legacy, mediaUrl: file, keepOpen });
    } else {
      // opening line, then the PDF carrying the summary, then the follow-up lines
      const [intro, summary, ...rest] = blocks;
      if (intro) await SendToContact({ contact, whatsapp, body: intro, keepOpen });
      await SendToContact({ contact, whatsapp, body: summary || "", mediaUrl: file, keepOpen });
      for (const text of rest) {
        // eslint-disable-next-line no-await-in-loop
        await SendToContact({ contact, whatsapp, body: text, keepOpen });
      }
    }
  } catch (err) {
    fs.unlink(path.join(PUBLIC_DIR, file), () => undefined);
    if (err instanceof AppError) throw err;
    throw new AppError("ERR_PROPOSAL_SEND_FAILED");
  }

  await p.update({ status: "sent", sentAt: new Date() });
  touchAnalytics(p.createdBy);
  await addActivity(lead.id, uid(req), "whatsapp", `Proposta #${p.id} enviada ao candidato (${p.courseName})`);
  void markMilestone(lead.id, "proposal_sent");
  await lead.update({ lastContactAt: new Date(), ...(lead.firstContactAt ? {} : { firstContactAt: new Date() }) });

  // move to the "proposta" stage when the lead is still earlier in the funnel
  const stages = await LeadStage.findAll({ order: [["position", "ASC"]] });
  const target = stages.find(s => s.type === "open" && /proposta/i.test(s.name));
  const current = stages.find(s => s.id === lead.stageId);
  if (target && current && current.type === "open" && current.position < target.position) {
    await changeStage(lead.id, target.id, uid(req));
  }
  await dispatchWebhook("proposal.sent", { proposalId: p.id, leadId: lead.id, course: p.courseName, firstMonthly: Number(p.firstMonthly), link: link(p) });
  getIO().emit("lead", { action: "update", lead: await loadLead(lead.id) });
  return res.json(present(p));
};

// ------------------------------------------------------------ public viewing
export const publicView = async (req: Request, res: Response): Promise<Response> => {
  const p = await Proposal.findOne({ where: { token: req.params.token } });
  if (!p || p.status === "draft") return res.status(404).send("Proposta indisponível");
  if (!p.viewedAt) {
    await p.update({ viewedAt: new Date() });
    await addActivity(p.leadId, null, "system", `O candidato abriu a proposta #${p.id}`);
    const lead = await Lead.findByPk(p.leadId, { attributes: ["id", "name", "ownerId"] });
    const { notify } = await import("../services/NotificationServices/Notify");
    if (lead) void notify([lead.ownerId, p.createdBy], { kind: "proposal_viewed", title: `${lead.name} abriu a proposta`, body: "Bom momento para falar com o lead.", link: `/crm?lead=${lead.id}`, dedupeKey: `proposal-viewed:${p.id}` });
    await dispatchWebhook("proposal.viewed", { proposalId: p.id, leadId: p.leadId });
    getIO().emit("lead", { action: "update", lead: await loadLead(p.leadId) });
  }
  const { html } = await rebuild(p);
  return res.type("html").send(html);
};

export const publicPdf = async (req: Request, res: Response): Promise<Response> => {
  const p = await Proposal.findOne({ where: { token: req.params.token }, include: [{ model: Lead, as: "lead", attributes: ["name"] }] });
  if (!p || p.status === "draft") return res.status(404).send("Proposta indisponível");
  const { html } = await rebuild(p);
  const buf = await renderPdf(html);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(pdfName(p.lead.name))}`);
  return res.send(buf);
};

// --------------------------------------------------- institutions / templates
export const templates = makeCrud(ProposalTemplate, {
  event: "proposalTemplate",
  fields: [
    "name", "institutionId", "enrollmentFee", "dueDay", "installments", "punctualityPct", "lateFee1Pct",
    "lateFee2Pct", "annualMin", "annualMax", "semestralSchedule", "bolsaFirst", "bolsaNext", "bolsaNote",
    "observation", "disclaimer", "finalMessage", "isDefault", "installmentsFixed", "hasRegression", "hasAdjustment",
    "fixedUntilEnd", "firstExempt", "waIntro", "waClosing", "active"
  ],
  required: ["name"],
  include: [{ model: Institution, as: "institutions", attributes: ["id", "name"], through: { attributes: [] } }],
  order: [["name", "ASC"]],
  beforeSave: (data, _req, existing) => {
    // a new model without the semester steps has none (it used to fail with a server error)
    if (!existing && data.semestralSchedule === undefined) data.semestralSchedule = [];
    if (data.semestralSchedule !== undefined) {
      data.semestralSchedule = JSON.stringify(parseSchedule(data.semestralSchedule));
    }
    if (data.institutionId === "" || data.institutionId === 0) data.institutionId = null;
    if (data.installmentsFixed === "" || data.installmentsFixed === 0) data.installmentsFixed = null;
    // the default model is the one every proposal falls back to: it stays active
    if ((data.isDefault ?? existing?.isDefault) && data.active === false) throw new AppError("ERR_PROPOSAL_TEMPLATE_DEFAULT_ACTIVE");
    return data;
  },
  afterSave: async (row, req) => {
    if (row.isDefault) await ProposalTemplate.update({ isDefault: false } as any, { where: { id: { [Op.ne]: row.id } } });
    // institutions that use this model
    if (Array.isArray(req.body.institutionIds)) {
      const ids = [...new Set(req.body.institutionIds.map(Number))].filter(Boolean) as number[];
      await ProposalTemplateInstitution.destroy({ where: { templateId: row.id } });
      if (ids.length) {
        await ProposalTemplateInstitution.bulkCreate(ids.map(institutionId => ({ templateId: row.id, institutionId })) as any);
      }
    }
  }
});
