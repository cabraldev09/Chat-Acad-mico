import { Request, Response } from "express";
import { Op, WhereOptions } from "sequelize";

import AppError from "../errors/AppError";
import { getPublicUrl } from "../helpers/PublicUrl";
import { isManagerRole, roleOf } from "../helpers/Roles";
import AcademicAnalysis from "../models/AcademicAnalysis";
import CurricularAnalysis from "../models/CurricularAnalysis";
import Student from "../models/Student";
import User from "../models/User";
import {
  academicView,
  correctAcademic,
  correctCurricularSubject,
  createAcademic,
  createCurricular,
  createStudent,
  curricularView,
  getRules,
  issueToken,
  normalizeRgm,
  saveRules,
  searchStudents,
  studentView,
  updateCurricular
} from "../analysis/Store";
import { mailConfigured, sendMail } from "../services/MailServices/SendMail";
import { studentAnalysisMail, studentLinkMail } from "../services/MailServices/Templates";
import { notify } from "../services/MailServices/Notify";
import { logger } from "../utils/logger";

// ------------------------------------------------------------------ who may do what
// Curricular analysis (the candidate's entry forecast): the whole sales side, the tutors and the management.
// Academic analysis and the students of the portal: the tutors (their own students) and the management.

const me = (req: Request): number => Number(req.user.id);
const isManager = (req: Request): boolean => isManagerRole(roleOf(req.user));
const isTutor = (req: Request): boolean => roleOf(req.user) === "tutor";
const frontBase = (): string => String(process.env.FRONTEND_URL || "").split(",")[0].trim().replace(/\/$/, "") || "http://localhost:3000";

const mustAcademic = (req: Request): void => {
  if (!isManager(req) && !isTutor(req)) throw new AppError("ERR_NO_PERMISSION", 403);
};

const fileOf = (req: Request): { bytes: Buffer; name: string } => {
  const file = (req as any).file as Express.Multer.File | undefined;
  if (!file || !file.buffer) throw new AppError("Envie um arquivo PDF.", 400);
  return { bytes: file.buffer, name: file.originalname || "documento.pdf" };
};

const num = (v: unknown): number | null => {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// ------------------------------------------------------------------ rules

export const rulesShow = async (_req: Request, res: Response): Promise<Response> => res.json(await getRules());
export const rulesSave = async (req: Request, res: Response): Promise<Response> => res.json(await saveRules(req.body));

// ------------------------------------------------------------------ curricular analysis

const loadCurricular = async (req: Request): Promise<CurricularAnalysis> => {
  const row = await CurricularAnalysis.findByPk(req.params.id);
  if (!row) throw new AppError("Análise não encontrada.", 404);
  if (!isManager(req) && row.userId !== me(req)) throw new AppError("ERR_NO_PERMISSION", 403);
  return row;
};

export const curricularIndex = async (req: Request, res: Response): Promise<Response> => {
  const where: WhereOptions = {};
  const and: any[] = [];
  if (!isManager(req)) and.push({ userId: me(req) });
  const q = String(req.query.search || "").trim();
  if (q) {
    const like = `%${q.replace(/[%_]/g, "")}%`;
    and.push({ [Op.or]: [{ candidateName: { [Op.iLike]: like } }, { courseName: { [Op.iLike]: like } }, { originalName: { [Op.iLike]: like } }] });
  }
  if (num(req.query.leadId)) and.push({ leadId: num(req.query.leadId) });
  if (num(req.query.contactId)) and.push({ contactId: num(req.query.contactId) });
  const rows = await CurricularAnalysis.findAll({ where: and.length ? { [Op.and]: and } : where, order: [["createdAt", "DESC"]], limit: 100 });
  return res.json(rows.map(r => curricularView(r, false)));
};

export const curricularStore = async (req: Request, res: Response): Promise<Response> => {
  const { bytes, name } = fileOf(req);
  const b = req.body || {};
  const row = await createCurricular(me(req), bytes, name, {
    entryPeriod: num(b.entryPeriod),
    startTerm: b.startTerm ? String(b.startTerm).trim() : undefined,
    leadId: num(b.leadId),
    contactId: num(b.contactId),
    candidateName: b.candidateName
  });
  return res.status(201).json(curricularView(row));
};

export const curricularShow = async (req: Request, res: Response): Promise<Response> => res.json(curricularView(await loadCurricular(req)));

export const curricularUpdate = async (req: Request, res: Response): Promise<Response> => {
  const row = await loadCurricular(req);
  const b = req.body || {};
  const out = await updateCurricular(row, {
    entryPeriod: b.entryPeriod === undefined ? undefined : num(b.entryPeriod),
    startTerm: b.startTerm === undefined ? undefined : String(b.startTerm).trim(),
    leadId: b.leadId === undefined ? undefined : num(b.leadId),
    contactId: b.contactId === undefined ? undefined : num(b.contactId),
    candidateName: b.candidateName
  });
  return res.json(curricularView(out));
};

export const curricularSubject = async (req: Request, res: Response): Promise<Response> => {
  const row = await loadCurricular(req);
  const b = req.body || {};
  const out = await correctCurricularSubject(row, String(req.params.subjectId), { status: b.status, period: b.period === undefined ? undefined : Number(b.period), workload: b.workload === undefined ? undefined : Number(b.workload) });
  return res.json(curricularView(out));
};

export const curricularRemove = async (req: Request, res: Response): Promise<Response> => {
  await (await loadCurricular(req)).destroy();
  return res.status(204).end();
};

// ------------------------------------------------------------------ academic analysis

// a tutor reaches the analyses of the students they follow and the ones they made; the management reaches all
const academicScope = async (req: Request): Promise<any[]> => {
  if (isManager(req)) return [];
  const mine = await Student.findAll({ where: { responsibleUserId: me(req) }, attributes: ["id"] });
  return [{ [Op.or]: [{ userId: me(req) }, { studentId: { [Op.in]: mine.map(s => s.id) } }] }];
};

const loadAcademic = async (req: Request): Promise<AcademicAnalysis> => {
  mustAcademic(req);
  const row = await AcademicAnalysis.findByPk(req.params.id);
  if (!row) throw new AppError("Análise não encontrada.", 404);
  if (!isManager(req) && row.userId !== me(req)) {
    const student = row.studentId ? await Student.findByPk(row.studentId, { attributes: ["responsibleUserId"] }) : null;
    if (!student || student.responsibleUserId !== me(req)) throw new AppError("ERR_NO_PERMISSION", 403);
  }
  return row;
};

export const academicIndex = async (req: Request, res: Response): Promise<Response> => {
  mustAcademic(req);
  const and: any[] = [{ isCurrent: true }, ...(await academicScope(req))];
  const q = String(req.query.search || "").trim();
  if (q) {
    const like = `%${q.replace(/[%_]/g, "")}%`;
    and.push({ [Op.or]: [{ studentName: { [Op.iLike]: like } }, { rgm: { [Op.iLike]: like } }, { courseName: { [Op.iLike]: like } }] });
  }
  if (num(req.query.leadId)) and.push({ leadId: num(req.query.leadId) });
  const rows = await AcademicAnalysis.findAll({ where: { [Op.and]: and }, order: [["createdAt", "DESC"]], limit: 100 });
  return res.json(rows.map(r => academicView(r, false)));
};

export const academicStore = async (req: Request, res: Response): Promise<Response> => {
  mustAcademic(req);
  const { bytes, name } = fileOf(req);
  const b = req.body || {};
  let student: Student | null = null;
  if (num(b.studentId)) {
    student = await Student.findByPk(num(b.studentId) as number);
    if (!student) throw new AppError("Aluno não encontrado.", 404);
    if (!isManager(req) && student.responsibleUserId !== me(req)) throw new AppError("ERR_NO_PERMISSION", 403);
  }
  const { analysis, reused } = await createAcademic(me(req), bytes, name, { student, origin: "STAFF_UPLOAD", leadId: num(b.leadId), contactId: num(b.contactId) });
  return res.status(reused ? 200 : 201).json({ ...academicView(analysis), reused });
};

export const academicShow = async (req: Request, res: Response): Promise<Response> => {
  const row = await loadAcademic(req);
  const history = row.studentId ? await AcademicAnalysis.findAll({ where: { studentId: row.studentId }, order: [["version", "DESC"]] }) : [];
  return res.json({ ...academicView(row), versions: history.map(h => ({ id: h.id, version: h.version, isCurrent: h.isCurrent, origin: h.origin, createdAt: h.createdAt, changeSummary: academicView(h, false).changeSummary })) });
};

// the student who already uses the portal is told when the team publishes a new version of the analysis
const notifyAnalysis = (student: Student | null, course: string | null): void => {
  if (student && student.activatedAt && !student.blockedAt) notify(student.email, studentAnalysisMail(student.name, course || student.courseName || "", `${frontBase()}/portal/login`), "student analysis");
};

export const academicUpdate = async (req: Request, res: Response): Promise<Response> => {
  const row = await loadAcademic(req);
  const b = req.body || {};
  const out = await correctAcademic(row, me(req), {
    currentPeriod: b.currentPeriod === undefined ? undefined : num(b.currentPeriod),
    enrollment: b.enrollmentSituation === undefined ? undefined : String(b.enrollmentSituation || "") || null,
    discipline: b.discipline && typeof b.discipline === "object" ? b.discipline : undefined
  });
  if (out.id !== row.id && row.studentId) notifyAnalysis(await Student.findByPk(row.studentId), out.courseName);
  if (b.leadId !== undefined) await out.update({ leadId: num(b.leadId) });
  if (b.contactId !== undefined) await out.update({ contactId: num(b.contactId) });
  return res.json(academicView(out));
};

export const academicRemove = async (req: Request, res: Response): Promise<Response> => {
  const row = await loadAcademic(req);
  // what is part of a student's history is not deleted by the common action
  if (row.studentId) throw new AppError("Esta análise faz parte do histórico de um aluno e não pode ser excluída.", 400);
  await row.destroy();
  return res.status(204).end();
};

// ------------------------------------------------------------------ students of the portal

const loadStudent = async (req: Request): Promise<Student> => {
  mustAcademic(req);
  const s = await Student.findByPk(req.params.id);
  if (!s) throw new AppError("Aluno não encontrado.", 404);
  if (!isManager(req) && s.responsibleUserId !== me(req)) throw new AppError("ERR_NO_PERMISSION", 403);
  return s;
};

export const studentIndex = async (req: Request, res: Response): Promise<Response> => {
  mustAcademic(req);
  const and: any[] = [];
  if (!isManager(req)) and.push({ responsibleUserId: me(req) });
  const q = String(req.query.search || "").trim();
  if (q) and.push(searchStudents(q));
  const students = await Student.findAll({ where: and.length ? { [Op.and]: and } : {}, order: [["name", "ASC"]], limit: 300 });
  const users = await User.findAll({ where: { id: { [Op.in]: students.map(s => s.responsibleUserId).filter(Boolean) } }, attributes: ["id", "name"] });
  const names = new Map(users.map(u => [u.id, u.name]));
  const current = await AcademicAnalysis.findAll({ where: { studentId: { [Op.in]: students.map(s => s.id) }, isCurrent: true } });
  const byStudent = new Map(current.map(a => [a.studentId, a]));
  return res.json(
    students.map(s => {
      const a = byStudent.get(s.id);
      return { ...studentView(s), responsibleName: s.responsibleUserId ? names.get(s.responsibleUserId) || null : null, current: a ? academicView(a, false) : null };
    })
  );
};

export const studentStore = async (req: Request, res: Response): Promise<Response> => {
  mustAcademic(req);
  const b = req.body || {};
  // a tutor follows the students they create; the management chooses who follows
  const responsible = isManager(req) ? num(b.responsibleUserId) || me(req) : me(req);
  const s = await createStudent({ rgm: b.rgm, name: b.name, email: b.email, phone: b.phone, courseName: b.courseName, poloId: num(b.poloId), responsibleUserId: responsible, leadId: num(b.leadId) });
  return res.status(201).json(studentView(s));
};

export const studentShow = async (req: Request, res: Response): Promise<Response> => {
  const s = await loadStudent(req);
  const versions = await AcademicAnalysis.findAll({ where: { studentId: s.id }, order: [["version", "DESC"]] });
  const current = versions.find(v => v.isCurrent) || null;
  return res.json({ ...studentView(s), current: current ? academicView(current) : null, versions: versions.map(v => academicView(v, false)) });
};

export const studentUpdate = async (req: Request, res: Response): Promise<Response> => {
  const s = await loadStudent(req);
  const b = req.body || {};
  const patch: any = {};
  if (b.name !== undefined) {
    const name = String(b.name).trim().slice(0, 160);
    if (!name) throw new AppError("Informe o nome do aluno.", 400);
    patch.name = name;
  }
  if (b.phone !== undefined) patch.phone = b.phone ? String(b.phone).slice(0, 40) : null;
  if (b.courseName !== undefined) patch.courseName = b.courseName ? String(b.courseName).slice(0, 200) : null;
  if (b.email !== undefined) {
    const email = b.email ? String(b.email).trim().toLowerCase() : null;
    if (email && !/^\S+@\S+\.\S+$/.test(email)) throw new AppError("E-mail inválido.", 400);
    if (email && email !== s.email && (await Student.findOne({ where: { email } }))) throw new AppError("Já existe um aluno com este e-mail.", 409);
    patch.email = email;
    // another address means another person may be reading: the old sessions stop
    if (email !== s.email) patch.sessionVersion = (s.sessionVersion || 0) + 1;
  }
  if (b.responsibleUserId !== undefined && isManager(req)) patch.responsibleUserId = num(b.responsibleUserId);
  if (b.blocked !== undefined) {
    patch.blockedAt = b.blocked ? new Date() : null;
    patch.sessionVersion = (patch.sessionVersion ?? s.sessionVersion ?? 0) + 1;
  }
  await s.update(patch);
  return res.json(studentView(s));
};

// The invitation: a link to choose the password. It goes by e-mail when the account is set up; the link is always
// returned too, so the tutor can send it by WhatsApp.
export const studentInvite = async (req: Request, res: Response): Promise<Response> => {
  const s = await loadStudent(req);
  if (s.blockedAt) throw new AppError("Este acesso está bloqueado. Desbloqueie antes de convidar.", 400);
  const token = await issueToken(s, s.activatedAt ? "reset" : "invite");
  const link = `${frontBase()}/portal/ativar/${token}`;
  let emailed = false;
  if (s.email && (await mailConfigured())) {
    try {
      await sendMail({ to: s.email, ...studentLinkMail(s.activatedAt ? "reset" : "invite", s.name, link, s.activatedAt ? "1 hora" : "7 dias") });
      emailed = true;
    } catch (err) {
      logger.warn(`student invite mail not sent: ${(err as Error).message}`);
    }
  }
  return res.json({ link, emailed, expires: s.activatedAt ? "1 hora" : "7 dias" });
};

// the staff sends a document on behalf of the student: the same checks (RGM and course) and the same versioning
export const studentUpload = async (req: Request, res: Response): Promise<Response> => {
  const s = await loadStudent(req);
  const { bytes, name } = fileOf(req);
  const { analysis, reused } = await createAcademic(me(req), bytes, name, { student: s, origin: "STAFF_UPLOAD" });
  if (!reused) notifyAnalysis(s, analysis.courseName);
  return res.status(reused ? 200 : 201).json({ ...academicView(analysis), reused });
};

export const portalUrl = (_req: Request, res: Response): Response => res.json({ url: `${frontBase()}/portal/login`, backend: getPublicUrl() });
void normalizeRgm;
