import crypto from "crypto";
import { getAppTz } from "../helpers/AppTime";
import { Op } from "sequelize";

import AppError from "../errors/AppError";
import { getSetting, setSetting } from "../helpers/AppSettings";
import AcademicAnalysis from "../models/AcademicAnalysis";
import CurricularAnalysis from "../models/CurricularAnalysis";
import Student from "../models/Student";
import { addActivity } from "../services/CrmServices/LeadCore";
import {
  AnalysisError,
  MAX_PDF_BYTES,
  computeCurricular,
  defaultStartTerm,
  evaluateAcademic,
  readAcademicPdf,
  readCurricularPdf,
  sha256,
  type StoredSubject
} from "./Engine";
import { DEFAULT_RULES, type AcademicRules } from "./domain/curricular-analysis";
import type { AcademicGridSnapshot, EnrollmentSituation } from "./domain/academic-analysis/types";
import { enrollmentFromCode } from "./domain/academic-analysis/enrollment";
import { academicDiff, academicFingerprint, canonicalCourse, canonicalRgm, contentFingerprint } from "./services/student-portal/fingerprints";
import { validatePdfBytes, PdfValidationError } from "./services/pdf/validate";

// ------------------------------------------------------------------ rules (editable in Configurações)

const RULES_KEY = "analysis_rules";

export const getRules = async (): Promise<AcademicRules> => {
  try {
    const stored = JSON.parse(await getSetting(RULES_KEY, "{}"));
    return mergeRules(stored);
  } catch (e) {
    return DEFAULT_RULES;
  }
};

const int = (v: unknown, min: number, max: number): number | null => {
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
};

// only known fields, only sane values: a bad value never reaches the engine
export const mergeRules = (input: any): AcademicRules => {
  const rules: AcademicRules = { ...DEFAULT_RULES };
  const extra = int(input?.extraSubjectsAllowed, 0, 10);
  if (extra !== null) rules.extraSubjectsAllowed = extra;
  if (input?.maximumSubjectsPerSemester === null || input?.maximumSubjectsPerSemester === "") rules.maximumSubjectsPerSemester = null;
  else {
    const cap = int(input?.maximumSubjectsPerSemester, 1, 30);
    if (cap !== null) rules.maximumSubjectsPerSemester = cap;
  }
  const add = input?.additionalSemesterCapacityRule;
  if (add && typeof add === "object") {
    if (add.type === "SAME_AS_LAST_PERIOD" || add.type === "UNCONFIGURED") rules.additionalSemesterCapacityRule = { type: add.type };
    else if (add.type === "FIXED_VALUE" && int(add.value, 1, 30) !== null) rules.additionalSemesterCapacityRule = { type: "FIXED_VALUE", value: Number(add.value) };
  }
  if (typeof input?.reviewCountsAsPending === "boolean") rules.reviewCountsAsPending = input.reviewCountsAsPending;
  const maxAdd = int(input?.maxAdditionalSemesters, 1, 20);
  if (maxAdd !== null) rules.maxAdditionalSemesters = maxAdd;
  if (input?.periodUnit === "SEMESTER" || input?.periodUnit === "YEAR") rules.periodUnit = input.periodUnit;
  return rules;
};

export const saveRules = async (input: any): Promise<AcademicRules> => {
  const rules = mergeRules(input);
  await setSetting(RULES_KEY, JSON.stringify(rules));
  return rules;
};

// ------------------------------------------------------------------ shared

const parse = <T>(raw: string | null | undefined, fallback: T): T => {
  try {
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch (e) {
    return fallback;
  }
};

const checkPdf = async (bytes: Buffer): Promise<void> => {
  try {
    await validatePdfBytes(bytes, { maxBytes: MAX_PDF_BYTES });
  } catch (err) {
    if (err instanceof PdfValidationError) throw new AppError(err.message, 400);
    throw err;
  }
};

// a message written for the person becomes the body of a 400 that the screen shows as it is
const asUserError = (err: unknown): never => {
  if (err instanceof AnalysisError) throw new AppError(err.message, 400);
  throw err;
};

// ------------------------------------------------------------------ curricular analysis

export const curricularView = (row: CurricularAnalysis, withSubjects = true) => ({
  id: row.id,
  userId: row.userId,
  leadId: row.leadId,
  contactId: row.contactId,
  candidateName: row.candidateName,
  originalName: row.originalName,
  pageCount: row.pageCount,
  status: row.status,
  errorMessage: row.errorMessage,
  courseName: row.courseName,
  matrixLabel: row.matrixLabel,
  campus: row.campus,
  modality: row.modality,
  headerEntryPeriod: row.headerEntryPeriod,
  entryPeriod: row.entryPeriod,
  entryPeriodSource: row.entryPeriodSource,
  startTerm: row.startTerm,
  enrollment: {
    status: row.enrollmentStatus || "PENDING",
    note: row.enrollmentNote,
    updatedAt: row.enrollmentUpdatedAt,
    updatedById: row.enrollmentUpdatedById,
    reanalysisAt: row.enrollmentReanalysisAt,
    dueAt: row.followUpDueAt,
    due: !!row.followUpDueAt && (row.enrollmentStatus || "PENDING") === "PENDING" && new Date(row.followUpDueAt).getTime() <= Date.now()
  },
  result: parse(row.result, null),
  ...(withSubjects ? { subjects: parse<StoredSubject[]>(row.subjects, []) } : {}),
  createdAt: row.createdAt,
  updatedAt: row.updatedAt
});

const recompute = async (row: CurricularAnalysis, patch: { entryPeriod?: number | null; startTerm?: string } = {}): Promise<CurricularAnalysis> => {
  const entryPeriod = patch.entryPeriod === undefined ? row.entryPeriod : patch.entryPeriod;
  const startTerm = patch.startTerm || row.startTerm || defaultStartTerm();
  const result = computeCurricular({
    subjects: parse<StoredSubject[]>(row.subjects, []),
    claims: parse(row.claims, []),
    entryPeriod,
    startTerm,
    rules: await getRules(),
    baseWarnings: parse(row.baseWarnings, [])
  });
  const completed = entryPeriod !== null;
  await row.update({
    entryPeriod,
    startTerm,
    status: completed ? "COMPLETED" : "WAITING_REVIEW",
    errorMessage: null,
    result: JSON.stringify(result),
    // the 24 hours count from the moment the analysis is delivered (ready), not from the upload; only once and only
    // while nobody answered it (a later recalculation does not restart the clock)
    ...(completed && !row.followUpDueAt && (row.enrollmentStatus || "PENDING") === "PENDING" && !row.enrollmentUpdatedAt ? { followUpDueAt: new Date(Date.now() + FOLLOW_UP_HOURS * 3600000) } : {})
  });
  return row;
};

export const FOLLOW_UP_HOURS = 24;

export const createCurricular = async (
  userId: number,
  bytes: Buffer,
  filename: string,
  opts: { entryPeriod?: number | null; startTerm?: string; leadId?: number | null; contactId?: number | null; candidateName?: string | null }
): Promise<CurricularAnalysis> => {
  await checkPdf(bytes);
  let read;
  try {
    read = await readCurricularPdf(bytes);
  } catch (err) {
    return asUserError(err);
  }
  const typed = opts.entryPeriod ? Number(opts.entryPeriod) : null;
  if (typed !== null && !(Number.isInteger(typed) && typed >= 1 && typed <= 20)) throw new AppError("O período de ingresso precisa ser um número de 1 a 20.", 400);
  const entryPeriod = typed ?? read.headerEntryPeriod;
  const row = await CurricularAnalysis.create({
    userId,
    leadId: opts.leadId || null,
    contactId: opts.contactId || null,
    candidateName: opts.candidateName ? String(opts.candidateName).slice(0, 160) : null,
    originalName: filename.slice(0, 255),
    fileHash: sha256(bytes),
    pageCount: read.pageCount,
    courseName: read.courseName,
    matrixLabel: read.matrixLabel,
    campus: read.campus,
    modality: read.modality,
    headerEntryPeriod: read.headerEntryPeriod,
    entryPeriodSource: typed !== null ? "USER" : read.headerEntryPeriod !== null ? "DOCUMENT" : null,
    startTerm: opts.startTerm || defaultStartTerm(),
    subjects: JSON.stringify(read.subjects),
    claims: JSON.stringify(read.claims),
    baseWarnings: JSON.stringify(read.warnings)
  } as any);
  try {
    return await recompute(row, { entryPeriod });
  } catch (err) {
    await row.destroy();
    return asUserError(err);
  }
};

export const updateCurricular = async (
  row: CurricularAnalysis,
  patch: { entryPeriod?: number | null; startTerm?: string; leadId?: number | null; contactId?: number | null; candidateName?: string | null }
): Promise<CurricularAnalysis> => {
  if (patch.entryPeriod !== undefined && patch.entryPeriod !== null) {
    const n = Number(patch.entryPeriod);
    if (!(Number.isInteger(n) && n >= 1 && n <= 20)) throw new AppError("O período de ingresso precisa ser um número de 1 a 20.", 400);
  }
  if (patch.leadId !== undefined) await row.update({ leadId: patch.leadId || null });
  if (patch.contactId !== undefined) await row.update({ contactId: patch.contactId || null });
  if (patch.candidateName !== undefined) await row.update({ candidateName: patch.candidateName ? String(patch.candidateName).slice(0, 160) : null });
  const changesForecast = patch.entryPeriod !== undefined || patch.startTerm !== undefined;
  if (changesForecast) {
    try {
      await recompute(row, {
        entryPeriod: patch.entryPeriod === undefined ? undefined : patch.entryPeriod === null ? null : Number(patch.entryPeriod),
        startTerm: patch.startTerm
      });
      if (patch.entryPeriod !== undefined) await row.update({ entryPeriodSource: patch.entryPeriod === null ? null : "USER" });
    } catch (err) {
      return asUserError(err);
    }
  }
  return row;
};

// the reading of one line was wrong: fix its status, period or workload and the forecast follows (kept visible as manual)
export const correctCurricularSubject = async (row: CurricularAnalysis, subjectId: string, patch: { status?: string; period?: number; workload?: number }): Promise<CurricularAnalysis> => {
  const subjects = parse<StoredSubject[]>(row.subjects, []);
  const subject = subjects.find(s => s.id === subjectId);
  if (!subject) throw new AppError("Disciplina não encontrada nesta análise.", 404);
  if (patch.status !== undefined) {
    if (!["EXEMPTED", "PENDING", "REVIEW"].includes(patch.status)) throw new AppError("Situação inválida.", 400);
    subject.status = patch.status as StoredSubject["status"];
    subject.readability = "CLEAR";
  }
  if (patch.period !== undefined) {
    const p = Number(patch.period);
    if (!(Number.isInteger(p) && p >= 1 && p <= 20)) throw new AppError("O período precisa ser de 1 a 20.", 400);
    subject.period = p;
  }
  if (patch.workload !== undefined) {
    const w = Number(patch.workload);
    if (!(Number.isFinite(w) && w >= 0 && w <= 2000)) throw new AppError("Carga horária inválida.", 400);
    subject.workload = Math.round(w);
  }
  subject.note = "Corrigido manualmente";
  await row.update({ subjects: JSON.stringify(subjects) });
  try {
    return await recompute(row);
  } catch (err) {
    return asUserError(err);
  }
};

// ------------------------------------------------------------------ academic analysis

export const academicView = (row: AcademicAnalysis, full = true) => {
  const snapshot = parse<AcademicGridSnapshot | null>(row.snapshot, null);
  return {
    id: row.id,
    userId: row.userId,
    studentId: row.studentId,
    leadId: row.leadId,
    contactId: row.contactId,
    origin: row.origin,
    originalName: row.originalName,
    documentType: row.documentType,
    rgm: row.rgm,
    studentName: row.studentName,
    courseName: row.courseName,
    currentPeriod: row.currentPeriod,
    currentPeriodConfirmed: row.currentPeriodConfirmed,
    status: row.status,
    version: row.version,
    isCurrent: row.isCurrent,
    changeSummary: parse<string[]>(row.changeSummary, []),
    forecast: parse(row.forecast, null),
    message: row.message,
    ...(full ? { snapshot } : { plannedWorkload: snapshot?.plannedWorkload ?? null, integralizedWorkload: snapshot?.integralizedWorkload ?? null }),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
};

const rowFields = (snapshot: AcademicGridSnapshot, evaluated: ReturnType<typeof evaluateAcademic>) => ({
  rgm: snapshot.rgm,
  studentName: snapshot.studentName,
  courseName: snapshot.courseName,
  currentPeriod: evaluated.snapshot.result.currentPeriod,
  currentPeriodConfirmed: evaluated.snapshot.result.currentPeriodConfirmed,
  status: evaluated.snapshot.result.status,
  snapshot: JSON.stringify(evaluated.snapshot),
  forecast: evaluated.forecast ? JSON.stringify(evaluated.forecast) : null,
  message: evaluated.message,
  factsHash: academicFingerprint(evaluated.snapshot)
});

export const currentAcademicOf = async (studentId: number): Promise<AcademicAnalysis | null> => AcademicAnalysis.findOne({ where: { studentId, isCurrent: true }, order: [["version", "DESC"]] });

// Reads a PDF into an analysis. For a student it is a new version only when the academic facts really changed;
// the same file, or the same text, or the same facts again just returns the current one.
export const createAcademic = async (
  userId: number | null,
  bytes: Buffer,
  filename: string,
  opts: { student?: Student | null; origin?: string; leadId?: number | null; contactId?: number | null }
): Promise<{ analysis: AcademicAnalysis; reused: boolean }> => {
  await checkPdf(bytes);
  const fileHash = sha256(bytes);
  const student = opts.student || null;
  if (student) {
    const same = await AcademicAnalysis.findOne({ where: { studentId: student.id, fileHash } });
    if (same) return { analysis: (await currentAcademicOf(student.id)) || same, reused: true };
  }
  const previous = student ? await currentAcademicOf(student.id) : null;
  const previousSnapshot = previous ? parse<AcademicGridSnapshot | null>(previous.snapshot, null) : null;
  let read;
  try {
    read = await readAcademicPdf(bytes, filename, previousSnapshot);
  } catch (err) {
    return asUserError(err);
  }
  const rules = await getRules();
  const evaluated = evaluateAcademic({ ...read.snapshot, documentType: read.documentType }, { rules });
  const snapshot = evaluated.snapshot;

  if (student) {
    if (!snapshot.rgm || canonicalRgm(snapshot.rgm) !== canonicalRgm(student.rgm)) {
      throw new AppError("O RGM do documento não corresponde ao do aluno. Confira o documento enviado.", 400);
    }
    if (student.courseName && snapshot.courseName && canonicalCourse(snapshot.courseName) !== canonicalCourse(student.courseName)) {
      throw new AppError("O curso do documento não corresponde ao do aluno. Peça à equipe acadêmica para conferir.", 400);
    }
    if (!student.courseName && snapshot.courseName) await student.update({ courseName: snapshot.courseName });
  }

  const contentHash = contentFingerprint(read.contentFingerprintSource);
  const facts = academicFingerprint(snapshot);
  if (student && previous) {
    if ((contentHash && previous.contentHash === contentHash) || previous.factsHash === facts) {
      return { analysis: previous, reused: true };
    }
  }
  const version = previous ? previous.version + 1 : 1;
  if (previous) await AcademicAnalysis.update({ isCurrent: false }, { where: { studentId: student!.id, isCurrent: true } });
  const analysis = await AcademicAnalysis.create({
    userId,
    studentId: student ? student.id : null,
    leadId: opts.leadId || null,
    contactId: opts.contactId || null,
    origin: opts.origin || "STAFF_UPLOAD",
    originalName: filename.slice(0, 255),
    fileHash,
    contentHash,
    documentType: read.documentType,
    version,
    isCurrent: true,
    changeSummary: JSON.stringify(academicDiff(previousSnapshot, snapshot)),
    ...rowFields(snapshot, evaluated)
  } as any);
  return { analysis, reused: false };
};

// The tutor confirmed the current period or fixed a discipline: recompute; a student's history gets a new version
export const correctAcademic = async (
  row: AcademicAnalysis,
  userId: number,
  patch: { currentPeriod?: number | null; enrollment?: string | null; discipline?: { index: number; period?: number | null; normalizedStatus?: string; inMainCurriculum?: boolean; workload?: number | null; name?: string } }
): Promise<AcademicAnalysis> => {
  const snapshot = parse<AcademicGridSnapshot | null>(row.snapshot, null);
  if (!snapshot) throw new AppError("Análise sem dados.", 400);
  let currentPeriod: number | null | undefined;
  if (patch.currentPeriod !== undefined) {
    if (patch.currentPeriod === null) currentPeriod = null;
    else {
      const p = Number(patch.currentPeriod);
      if (!(Number.isInteger(p) && p >= 1 && p <= 20)) throw new AppError("O período atual precisa ser um número de 1 a 20.", 400);
      currentPeriod = p;
    }
  }
  if (patch.discipline) {
    const d = snapshot.disciplines[patch.discipline.index];
    if (!d) throw new AppError("Disciplina não encontrada.", 404);
    const { period, normalizedStatus, inMainCurriculum, workload, name } = patch.discipline;
    if (period !== undefined) {
      if (period !== null && !(Number.isInteger(Number(period)) && Number(period) >= 1 && Number(period) <= 20)) throw new AppError("O período precisa ser de 1 a 20.", 400);
      d.period = period === null ? null : Number(period);
      d.rawPeriod = d.period === null ? "" : String(d.period);
      d.curricularPeriodProvenance = { source: "TUTOR", confirmed: d.period !== null };
    }
    if (normalizedStatus !== undefined) {
      const s = String(normalizedStatus).trim().toUpperCase();
      if (!s || s.length > 40) throw new AppError("Situação inválida.", 400);
      d.normalizedStatus = s;
      d.originalStatus = s;
    }
    if (inMainCurriculum !== undefined) d.inMainCurriculum = !!inMainCurriculum;
    if (workload !== undefined) d.workload = workload === null ? null : Math.max(0, Math.round(Number(workload)) || 0);
    if (name !== undefined && String(name).trim()) d.name = String(name).trim().toUpperCase().slice(0, 200);
    d.manualEdited = true;
    snapshot.manuallyEdited = true;
  }
  const rules = await getRules();
  let enrollment: EnrollmentSituation | null | undefined;
  if (patch.enrollment !== undefined) {
    enrollment = patch.enrollment ? enrollmentFromCode(patch.enrollment, "STAFF") : null;
    if (patch.enrollment && !enrollment) throw new AppError("Situação da matrícula inválida.", 400);
  }
  const evaluated = evaluateAcademic(snapshot, { currentPeriod, rules, enrollment });
  const facts = academicFingerprint(evaluated.snapshot);
  if (row.studentId && row.isCurrent && facts !== row.factsHash) {
    // a student's published history never changes behind their back: the correction is a new version
    await AcademicAnalysis.update({ isCurrent: false }, { where: { studentId: row.studentId, isCurrent: true } });
    const latest = (await AcademicAnalysis.max("version", { where: { studentId: row.studentId } })) as number;
    return AcademicAnalysis.create({
      userId,
      studentId: row.studentId,
      leadId: row.leadId,
      contactId: row.contactId,
      origin: "CORRECTION",
      originalName: row.originalName,
      fileHash: null,
      contentHash: row.contentHash,
      documentType: row.documentType,
      version: (latest || row.version) + 1,
      isCurrent: true,
      changeSummary: JSON.stringify(academicDiff(snapshot, evaluated.snapshot)),
      ...rowFields(evaluated.snapshot, evaluated)
    } as any);
  }
  await row.update({ ...rowFields(evaluated.snapshot, evaluated) });
  return row;
};

// ------------------------------------------------------------------ students (portal)

const TOKEN_HOURS = { invite: 7 * 24, reset: 1 };

export const hashToken = (token: string): string => crypto.createHash("sha256").update(token).digest("hex");

export const studentView = (s: Student) => ({
  id: s.id,
  rgm: s.rgm,
  name: s.name,
  email: s.email,
  phone: s.phone,
  courseName: s.courseName,
  poloId: s.poloId,
  responsibleUserId: s.responsibleUserId,
  leadId: s.leadId,
  activated: !!s.activatedAt,
  blocked: !!s.blockedAt,
  lastLoginAt: s.lastLoginAt,
  createdAt: s.createdAt
});

export const normalizeRgm = (v: unknown): string => String(v || "").replace(/\s+/g, "").trim().slice(0, 40);

export const createStudent = async (input: { rgm: string; name: string; email?: string | null; phone?: string | null; courseName?: string | null; poloId?: number | null; responsibleUserId?: number | null; leadId?: number | null }): Promise<Student> => {
  const rgm = normalizeRgm(input.rgm);
  const name = String(input.name || "").trim().slice(0, 160);
  if (!rgm || !/^[A-Za-z0-9.\-/]+$/.test(rgm)) throw new AppError("Informe o RGM do aluno (só letras, números e traços).", 400);
  if (!name) throw new AppError("Informe o nome do aluno.", 400);
  const email = input.email ? String(input.email).trim().toLowerCase() : null;
  if (email && !/^\S+@\S+\.\S+$/.test(email)) throw new AppError("E-mail inválido.", 400);
  if (await Student.findOne({ where: { rgm } })) throw new AppError("Já existe um aluno com este RGM.", 409);
  if (email && (await Student.findOne({ where: { email } }))) throw new AppError("Já existe um aluno com este e-mail.", 409);
  return Student.create({ rgm, name, email, phone: input.phone || null, courseName: input.courseName || null, poloId: input.poloId || null, responsibleUserId: input.responsibleUserId || null, leadId: input.leadId || null } as any);
};

// one link at a time: a new one cancels the older ones of the same kind
export const issueToken = async (student: Student, kind: "invite" | "reset"): Promise<string> => {
  const { default: StudentToken } = await import("../models/StudentToken");
  await StudentToken.update({ usedAt: new Date() }, { where: { studentId: student.id, kind, usedAt: null } as any });
  const token = crypto.randomBytes(32).toString("hex");
  await StudentToken.create({ studentId: student.id, kind, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + TOKEN_HOURS[kind] * 3600000) } as any);
  return token;
};

export const findValidToken = async (token: string) => {
  const { default: StudentToken } = await import("../models/StudentToken");
  if (!/^[a-f0-9]{64}$/.test(String(token || ""))) return null;
  return StudentToken.findOne({ where: { tokenHash: hashToken(token), usedAt: null, expiresAt: { [Op.gt]: new Date() } } as any, include: [Student] });
};

export const searchStudents = (q: string) => {
  const like = `%${q.replace(/[%_]/g, "")}%`;
  return { [Op.or]: [{ name: { [Op.iLike]: like } }, { rgm: { [Op.iLike]: like } }, { email: { [Op.iLike]: like } }] };
};

// ------------------------------------------------------------------ the 24-hour return (result of the commercial service)

export type EnrollmentDecision = { status: "ENROLLED" | "NOT_ENROLLED"; note?: string | null; reanalysis?: boolean };

// weekdays between two instants, counted on the calendar of the company (Saturday and Sunday do not count), as "business
// days without a result"
const localDate = (d: Date): { y: number; m: number; d: number } => {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: getAppTz(), year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);
  const get = (t: string) => Number(parts.find(p => p.type === t)?.value);
  return { y: get("year"), m: get("month"), d: get("day") };
};

export const businessDaysBetween = (from: Date, to: Date = new Date()): number => {
  const a = localDate(new Date(from));
  const b = localDate(new Date(to));
  const end = Date.UTC(b.y, b.m - 1, b.d);
  let days = 0;
  for (let t = Date.UTC(a.y, a.m - 1, a.d); t < end; t += 86400000) {
    const day = new Date(t).getUTCDay();
    if (day !== 0 && day !== 6) days += 1;
  }
  return days;
};

// Enrolled closes the question; not enrolled closes it with the reason; a new analysis asks again in 24 hours.
export const setEnrollment = async (row: CurricularAnalysis, userId: number, decision: EnrollmentDecision): Promise<CurricularAnalysis> => {
  if (row.status !== "COMPLETED") throw new AppError("O resultado só pode ser registrado depois que a análise estiver pronta.", 400);
  const note = String(decision.note || "").trim().slice(0, 300);
  const now = new Date();
  let patch: Record<string, unknown>;
  let activity: string;
  if (decision.reanalysis) {
    patch = { enrollmentStatus: "PENDING", enrollmentNote: note || null, enrollmentReanalysisAt: now, followUpDueAt: new Date(now.getTime() + FOLLOW_UP_HOURS * 3600000), followUpNotifiedAt: null, followUpNotificationCount: 0 };
    activity = `Reanálise da análise curricular: novo retorno em ${FOLLOW_UP_HOURS} horas.`;
  } else if (decision.status === "ENROLLED") {
    patch = { enrollmentStatus: "ENROLLED", enrollmentNote: note || null, followUpDueAt: null };
    activity = "Análise curricular: o candidato se matriculou.";
  } else if (decision.status === "NOT_ENROLLED") {
    if (note.length < 3) throw new AppError("Informe o motivo da não matrícula.", 400);
    patch = { enrollmentStatus: "NOT_ENROLLED", enrollmentNote: note, followUpDueAt: null };
    activity = `Análise curricular: o candidato não se matriculou. Motivo: ${note}`;
  } else {
    throw new AppError("Resultado inválido.", 400);
  }
  await row.update({ ...patch, enrollmentUpdatedAt: now, enrollmentUpdatedById: userId });
  if (row.leadId) await addActivity(row.leadId, userId, "followup", activity).catch(() => undefined);
  return row;
};

const dueWhere = () => ({ status: "COMPLETED", enrollmentStatus: "PENDING", followUpDueAt: { [Op.lte]: new Date() } });

// returns waiting for an answer (the bell of the owner; the management sees everyone's)
export const listDueFollowUps = async (userId: number | null, take = 20): Promise<CurricularAnalysis[]> =>
  CurricularAnalysis.findAll({ where: { ...dueWhere(), ...(userId ? { userId } : {}) } as any, order: [["followUpDueAt", "ASC"]], limit: take });

export const countDueFollowUps = async (userId: number | null): Promise<number> =>
  CurricularAnalysis.count({ where: { ...dueWhere(), ...(userId ? { userId } : {}) } as any });

// delivered more than two business days ago and still waiting for an answer (a new analysis keeps counting from its date);
// only the ones that carry a return date, so what existed before this control does not flood the list
export const listStaleEnrollmentCases = async (userId: number | null, take = 6): Promise<CurricularAnalysis[]> => {
  const candidates = await CurricularAnalysis.findAll({
    // two business days are at least two calendar days: the return fell due at least a day ago
    where: { status: "COMPLETED", enrollmentStatus: "PENDING", followUpDueAt: { [Op.lte]: new Date(Date.now() - 24 * 3600000) }, ...(userId ? { userId } : {}) } as any,
    order: [["followUpDueAt", "ASC"]],
    limit: 500
  });
  return candidates.filter(c => businessDaysBetween(c.enrollmentReanalysisAt || c.createdAt) > 2).slice(0, take);
};
