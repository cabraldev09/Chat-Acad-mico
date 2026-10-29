import { Request, Response } from "express";

import AppError from "../errors/AppError";
import { logger } from "../utils/logger";
import Course from "../models/Course";
import CourseCohort from "../models/CourseCohort";
import Polo from "../models/Polo";
import RegulatoryNorm from "../models/RegulatoryNorm";
import { syncMecKnowledge } from "../services/CommercialServices/MecDefaults";
import { STALE_DAYS, cohortGaps, cohortsOfCourse, normsList, seedNorms } from "../services/CommercialServices/Norms";

// The classes (turmas) of each course and the register of the national norms. What is empty is "not confirmed" for the agents.

const MODALITIES = ["EAD", "SEMIPRESENCIAL", "PRESENCIAL"];
const REGIMES = ["ead_pre_decreto", "semipresencial_transicao", "semipresencial_pleno", "presencial", "nao_definido"];
const ASSESSMENTS = ["nao_definido", "parcial", "definido"];
const NORM_STATUS = ["vigente", "alterada", "revogada"];

const text = (v: any, n: number): string | null => {
  const s = String(v ?? "").trim().slice(0, n);
  return s || null;
};
const oneOf = (v: any, list: string[], code: string): string | null => {
  const s = text(v, 60);
  if (!s) return null;
  if (!list.includes(s)) throw new AppError(code, 400);
  return s;
};
const day = (v: any): string | null => {
  const s = text(v, 10);
  if (!s) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(new Date(`${s}T12:00:00Z`).getTime())) throw new AppError("ERR_DATE_INVALID", 400);
  return s;
};
const flag = (v: any): boolean | null => (v === null || v === undefined || v === "" ? null : v === true || v === "true" || v === 1 || v === "1");

const cohortValues = (b: any) => {
  const intakeTerm = text(b.intakeTerm, 10);
  if (intakeTerm && !/^\d{4}\/[12]$/.test(intakeTerm)) throw new AppError("ERR_INTAKE_TERM_INVALID", 400);
  const label = text(b.label, 120);
  if (!label) throw new AppError("ERR_NAME_REQUIRED", 400);
  return {
    label,
    poloId: Number(b.poloId) || null,
    intakeTerm,
    intakeDate: day(b.intakeDate),
    contractedModality: oneOf(b.contractedModality, MODALITIES, "ERR_MODALITY_INVALID"),
    transitionRegime: oneOf(b.transitionRegime, REGIMES, "ERR_REGIME_INVALID"),
    transitionNote: text(b.transitionNote, 2000),
    expectedCalendar: text(b.expectedCalendar, 3000),
    presencialStart: day(b.presencialStart),
    syncRules: text(b.syncRules, 2000),
    practiceSchedule: text(b.practiceSchedule, 3000),
    practiceDefined: flag(b.practiceDefined),
    assessmentsStatus: oneOf(b.assessmentsStatus, ASSESSMENTS, "ERR_ASSESSMENT_INVALID"),
    assessmentsNote: text(b.assessmentsNote, 2000),
    activityLocation: text(b.activityLocation, 2000),
    published: b.published === true || b.published === "true"
  };
};

export const cohortsList = async (req: Request, res: Response): Promise<Response> => {
  const courseId = Number(req.query.courseId) || 0;
  const courses = await Course.findAll({ where: { active: true } as any, attributes: ["id", "name", "modality", "level"], order: [["name", "ASC"]] });
  const polos = await Polo.findAll({ attributes: ["id", "name", "city"], order: [["name", "ASC"]] });
  const rows = courseId ? await cohortsOfCourse(courseId) : await CourseCohort.findAll({ order: [["courseId", "ASC"], ["intakeDate", "DESC"]] });
  return res.json({ courses, polos, cohorts: rows, gaps: await cohortGaps() });
};

export const cohortStore = async (req: Request, res: Response): Promise<Response> => {
  const courseId = Number(req.body?.courseId);
  if (!courseId || !(await Course.findByPk(courseId))) throw new AppError("ERR_NOT_FOUND", 404);
  const row = await CourseCohort.create({ courseId, ...cohortValues(req.body || {}) } as any);
  return res.status(201).json(row);
};

export const cohortUpdate = async (req: Request, res: Response): Promise<Response> => {
  const row = await CourseCohort.findByPk(req.params.id);
  if (!row) throw new AppError("ERR_NOT_FOUND", 404);
  await row.update(cohortValues({ ...row.toJSON(), ...(req.body || {}) }) as any);
  return res.json(row);
};

export const cohortRemove = async (req: Request, res: Response): Promise<Response> => {
  const row = await CourseCohort.findByPk(req.params.id);
  if (!row) throw new AppError("ERR_NOT_FOUND", 404);
  await row.destroy();
  return res.json({ ok: true });
};

// ------------------------------------------------------------------ the norms
export const normsShow = async (_req: Request, res: Response): Promise<Response> => {
  await seedNorms();
  return res.json({ staleDays: STALE_DAYS, norms: await normsList() });
};

// a change in a norm reaches the agents right away (their knowledge base is rewritten)
const learn = (): void => {
  void syncMecKnowledge().catch(err => logger.warn(`norms not synced to the agents: ${err}`));
};

export const normStore = async (req: Request, res: Response): Promise<Response> => {
  const b = req.body || {};
  const number = text(b.number, 160);
  const title = text(b.title, 240);
  const summary = text(b.summary, 12000);
  if (!number || !title || !summary) throw new AppError("ERR_NAME_REQUIRED", 400);
  const key = `custom-${number.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60)}`;
  if (await RegulatoryNorm.findOne({ where: { key } })) throw new AppError("ERR_DUPLICATED", 409);
  const row = await RegulatoryNorm.create({
    key, number, title, summary, kind: b.kind === "decreto" ? "decreto" : b.kind === "portaria" ? "portaria" : "outro", publishedAt: day(b.publishedAt), sourceUrl: text(b.sourceUrl, 500),
    status: oneOf(b.status, NORM_STATUS, "ERR_STATUS_INVALID") || "vigente", amendments: text(b.amendments, 4000), fromSystem: false,
    reviewedAt: new Date(), reviewedBy: Number(req.user?.id) || null
  } as any);
  learn();
  return res.status(201).json(row);
};

export const normUpdate = async (req: Request, res: Response): Promise<Response> => {
  const row = await RegulatoryNorm.findByPk(req.params.id);
  if (!row) throw new AppError("ERR_NOT_FOUND", 404);
  const b = req.body || {};
  const patch: Record<string, any> = {};
  if ("status" in b) patch.status = oneOf(b.status, NORM_STATUS, "ERR_STATUS_INVALID") || "vigente";
  if ("amendments" in b) patch.amendments = text(b.amendments, 4000);
  if ("sourceUrl" in b) patch.sourceUrl = text(b.sourceUrl, 500);
  if ("summary" in b) {
    const summary = text(b.summary, 12000);
    if (!summary) throw new AppError("ERR_NAME_REQUIRED", 400);
    if (summary !== row.summary) {
      patch.summary = summary;
      patch.fromSystem = false;
    }
  }
  // whoever changes the text or the status has just looked at the source
  if (b.reviewed === true || "status" in b || "amendments" in b) {
    patch.reviewedAt = new Date();
    patch.reviewedBy = Number(req.user?.id) || null;
  }
  await row.update(patch as any);
  learn();
  return res.json(row);
};
