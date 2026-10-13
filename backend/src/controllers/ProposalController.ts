import { Request, Response } from "express";
import fs from "fs";
import path from "path";
import { Op } from "sequelize";
import { randomBytes } from "crypto";

import Lead from "../models/Lead";
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
import { calcProposal, ProposalParams, SemestralStep } from "../services/ProposalServices/calc";
import { renderProposalHtml } from "../services/ProposalServices/render";
import { renderPdf } from "../services/ProposalServices/pdf";
import makeCrud from "./crudFactory";

const PUBLIC_DIR = path.resolve(__dirname, "..", "..", "public");
const uid = (req: Request) => Number(req.user.id);
const num = (v: any, d = 0) => (v === undefined || v === null || v === "" || Number.isNaN(Number(v)) ? d : Number(v));

interface Snapshot {
  title: string;
  modalityLabel?: string;
  texts: { bolsaNote?: string | null; observation?: string | null; disclaimer?: string | null; finalMessage?: string | null };
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

const defaultTemplate = async (id?: number | null) =>
  (id && (await ProposalTemplate.findByPk(id))) ||
  (await ProposalTemplate.findOne({ where: { isDefault: true } })) ||
  (await ProposalTemplate.findOne({ order: [["id", "ASC"]] }));

const defaultStart = (entryTerm?: string | null) => {
  const m = String(entryTerm || "").match(/(20\d{2})\s*[./-]\s*([12])/);
  if (m) return { startYear: Number(m[1]), startSemester: Number(m[2]) as 1 | 2 };
  const now = new Date();
  return { startYear: now.getFullYear(), startSemester: (now.getMonth() < 6 ? 1 : 2) as 1 | 2 };
};

const modalityLabel = (c?: Course | null) =>
  c ? [c.modality, c.category || c.level].filter(Boolean).join(" - ") : undefined;

// Everything the studio needs to start: course price, template rules, calendar
const buildDefaults = async (lead: Lead, courseId?: number | null, templateId?: number | null) => {
  const course = courseId ? await Course.findByPk(courseId) : lead.courseId ? await Course.findByPk(lead.courseId) : null;
  const tpl = await defaultTemplate(templateId);
  if (!tpl) throw new AppError("ERR_NO_PROPOSAL_TEMPLATE");
  const gross = course?.monthlyFee ? Number(course.monthlyFee) : 0;
  const params: ProposalParams = {
    gross,
    firstMonthly: gross ? Math.round(gross * 0.2 * 100) / 100 : 0,
    enrollmentFee: Number(tpl.enrollmentFee),
    dueDay: tpl.dueDay,
    installments: tpl.installments,
    semesters: course?.semesters || 8,
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
    firstDueDate: null
  };
  const institutionId = course?.institutionId || tpl.institutionId || null;
  const snapshot: Snapshot = {
    title: course?.name || lead.name,
    modalityLabel: modalityLabel(course),
    texts: { bolsaNote: tpl.bolsaNote, observation: tpl.observation, disclaimer: tpl.disclaimer, finalMessage: tpl.finalMessage },
    institutionId
  };
  return { course, tpl, params, snapshot };
};

const normalizeParams = (base: ProposalParams, raw: any = {}): ProposalParams => {
  const p: ProposalParams = {
    gross: num(raw.gross, base.gross),
    firstMonthly: num(raw.firstMonthly, base.firstMonthly),
    enrollmentFee: num(raw.enrollmentFee, base.enrollmentFee),
    dueDay: Math.min(28, Math.max(1, num(raw.dueDay, base.dueDay))),
    installments: Math.max(1, Math.round(num(raw.installments, base.installments))),
    semesters: Math.min(20, Math.max(1, Math.round(num(raw.semesters, base.semesters)))),
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
    projectionFrom: raw.projectionFrom ? Math.round(num(raw.projectionFrom)) : null,
    projectionTo: raw.projectionTo ? Math.round(num(raw.projectionTo)) : null,
    firstDueDate: raw.firstDueDate || null
  };
  if (!(p.gross > 0)) throw new AppError("ERR_PROPOSAL_NO_GROSS");
  if (!(p.firstMonthly > 0) || p.firstMonthly > p.gross) throw new AppError("ERR_PROPOSAL_FIRST_MONTHLY");
  return p;
};

const compose = async (lead: Lead, params: ProposalParams, snapshot: Snapshot, generatedAt = new Date()) => {
  const institution = snapshot.institutionId ? await Institution.findByPk(snapshot.institutionId) : null;
  const result = calcProposal(params);
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
  return { result, html, institution };
};

const link = (p: Proposal) => `${getPublicUrl()}/p/${p.token}`;
const present = (p: Proposal) => ({ ...p.toJSON(), params: JSON.parse(p.params), link: link(p) });

// ---------------------------------------------------------------------------

export const defaults = async (req: Request, res: Response): Promise<Response> => {
  const lead = await Lead.findByPk(String(req.query.leadId));
  if (!lead) throw new AppError("ERR_LEAD_NOT_FOUND", 404);
  const { params, snapshot, tpl, course } = await buildDefaults(
    lead,
    req.query.courseId ? Number(req.query.courseId) : null,
    req.query.templateId ? Number(req.query.templateId) : null
  );
  return res.json({ params, snapshot, templateId: tpl.id, courseId: course ? course.id : null });
};

export const preview = async (req: Request, res: Response): Promise<Response> => {
  const { leadId, courseId, templateId, params: raw, snapshot: snapRaw } = req.body;
  const lead = await Lead.findByPk(leadId);
  if (!lead) throw new AppError("ERR_LEAD_NOT_FOUND", 404);
  const d = await buildDefaults(lead, courseId, templateId);
  const params = normalizeParams(d.params, raw);
  const snapshot: Snapshot = {
    ...d.snapshot,
    ...(snapRaw && typeof snapRaw === "object" ? { texts: { ...d.snapshot.texts, ...(snapRaw.texts || {}) }, institutionId: snapRaw.institutionId ?? d.snapshot.institutionId } : {})
  };
  const { result, html } = await compose(lead, params, snapshot);
  return res.json({ result, html });
};

const save = async (req: Request, existing?: Proposal) => {
  const { leadId, courseId, templateId, params: raw, snapshot: snapRaw } = req.body;
  const lead = await Lead.findByPk(existing ? existing.leadId : leadId);
  if (!lead) throw new AppError("ERR_LEAD_NOT_FOUND", 404);
  const d = await buildDefaults(lead, existing ? existing.courseId : courseId, existing ? existing.templateId : templateId);
  const params = normalizeParams(d.params, raw);
  const snapshot: Snapshot = {
    ...d.snapshot,
    ...(snapRaw && typeof snapRaw === "object" ? { texts: { ...d.snapshot.texts, ...(snapRaw.texts || {}) }, institutionId: snapRaw.institutionId ?? d.snapshot.institutionId } : {})
  };
  const result = calcProposal(params);
  const data: any = {
    courseName: snapshot.title,
    grossFee: params.gross,
    firstMonthly: params.firstMonthly,
    bolsaPct: result.bolsaApplied,
    params: JSON.stringify({ params, snapshot }),
    courseId: d.course ? d.course.id : null,
    templateId: d.tpl.id,
    institutionId: snapshot.institutionId || null
  };
  if (existing) {
    await existing.update(data);
    return existing;
  }
  return Proposal.create({ ...data, leadId: lead.id, token: randomBytes(18).toString("hex"), createdBy: uid(req), status: "draft" });
};

const rebuild = async (p: Proposal) => {
  const lead = (await Lead.findByPk(p.leadId)) as Lead;
  const { params, snapshot } = JSON.parse(p.params);
  return compose(lead, params, snapshot, p.createdAt);
};

export const store = async (req: Request, res: Response): Promise<Response> => {
  const p = await save(req);
  await addActivity(p.leadId, uid(req), "system", `Proposta #${p.id} criada (${p.courseName}, 1ª mensalidade ${Number(p.firstMonthly).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })})`);
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
  const rows = await Proposal.findAll({
    where: req.query.leadId ? { leadId: Number(req.query.leadId) } : {},
    include: [{ model: User, as: "author", attributes: ["id", "name"] }],
    order: [["id", "DESC"]],
    limit: 100
  });
  return res.json(rows.map(r => ({ ...r.toJSON(), params: undefined, link: link(r) })));
};

export const show = async (req: Request, res: Response): Promise<Response> => {
  const p = await Proposal.findByPk(req.params.id);
  if (!p) throw new AppError("ERR_NOT_FOUND", 404);
  const { html, result } = await rebuild(p);
  return res.json({ ...present(p), html, result });
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
  await p.destroy();
  return res.json({ message: "deleted" });
};

const pdfName = (name: string) => `Proposta - ${name.replace(/[\\/:*?"<>|]/g, "").trim()}.pdf`;

export const pdf = async (req: Request, res: Response): Promise<Response> => {
  const p = await Proposal.findByPk(req.params.id, { include: [{ model: Lead, as: "lead", attributes: ["name"] }] });
  if (!p) throw new AppError("ERR_NOT_FOUND", 404);
  const { html } = await rebuild(p);
  const buf = await renderPdf(html);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(pdfName(p.lead.name))}`);
  return res.send(buf);
};

export const send = async (req: Request, res: Response): Promise<Response> => {
  const p = await Proposal.findByPk(req.params.id);
  if (!p) throw new AppError("ERR_NOT_FOUND", 404);
  const lead = (await Lead.findByPk(p.leadId)) as Lead;
  const { html } = await rebuild(p);
  const buf = await renderPdf(html);

  // the file lives in /public so every channel can upload it
  const file = `proposta-${p.id}-${Date.now()}.pdf`;
  fs.writeFileSync(path.join(PUBLIC_DIR, file), buf);

  const { contact, whatsapp } = await resolveLeadTarget(lead, uid(req), req.body.whatsappId);
  const first = lead.name.split(" ")[0];
  const body =
    (req.body.message && String(req.body.message).trim()) ||
    `Olá, ${first}! Segue a proposta do curso ${p.courseName}. Qualquer dúvida, estou à disposição.`;
  try {
    await SendToContact({ contact, whatsapp, body, mediaUrl: file, keepOpen: { userId: uid(req) } });
  } catch (err) {
    fs.unlink(path.join(PUBLIC_DIR, file), () => undefined);
    throw new AppError("ERR_PROPOSAL_SEND_FAILED");
  }

  await p.update({ status: "sent", sentAt: new Date() });
  await addActivity(lead.id, uid(req), "whatsapp", `Proposta #${p.id} enviada ao candidato (${p.courseName})`);
  await lead.update({ lastContactAt: new Date(), ...(lead.firstContactAt ? {} : { firstContactAt: new Date() }) });

  // move to the "proposta" stage when the lead is still earlier in the funnel
  const stages = await LeadStage.findAll({ order: [["position", "ASC"]] });
  const target = stages.find(s => s.type === "open" && /proposta/i.test(s.name));
  const current = stages.find(s => s.id === lead.stageId);
  if (target && current && current.type === "open" && current.position < target.position) {
    await changeStage(lead.id, target.id, uid(req));
  }
  dispatchWebhook("proposal.sent", { proposalId: p.id, leadId: lead.id, course: p.courseName, firstMonthly: Number(p.firstMonthly), link: link(p) });
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
    dispatchWebhook("proposal.viewed", { proposalId: p.id, leadId: p.leadId });
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
export const institutions = makeCrud(Institution, {
  event: "institution",
  fields: ["name", "cnpj", "logoFile", "active"],
  required: ["name"],
  order: [["name", "ASC"]],
  beforeSave: data => {
    if (data.logoFile) data.logoFile = path.basename(String(data.logoFile));
    return data;
  }
});

export const templates = makeCrud(ProposalTemplate, {
  event: "proposalTemplate",
  fields: [
    "name", "institutionId", "enrollmentFee", "dueDay", "installments", "punctualityPct", "lateFee1Pct",
    "lateFee2Pct", "annualMin", "annualMax", "semestralSchedule", "bolsaFirst", "bolsaNext", "bolsaNote",
    "observation", "disclaimer", "finalMessage", "isDefault"
  ],
  required: ["name"],
  order: [["name", "ASC"]],
  beforeSave: data => {
    if (data.semestralSchedule !== undefined) {
      data.semestralSchedule = JSON.stringify(parseSchedule(data.semestralSchedule));
    }
    if (data.institutionId === "" || data.institutionId === 0) data.institutionId = null;
    return data;
  },
  afterSave: async row => {
    if (row.isDefault) await ProposalTemplate.update({ isDefault: false } as any, { where: { id: { [Op.ne]: row.id } } });
  }
});
