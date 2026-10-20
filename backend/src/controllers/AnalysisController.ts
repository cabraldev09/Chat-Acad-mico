import { isEmail } from "../helpers/Email";
import { Request, Response } from "express";
import { Op, WhereOptions } from "sequelize";

import AppError from "../errors/AppError";
import { getPublicUrl } from "../helpers/PublicUrl";
import { isManagerRole, roleOf } from "../helpers/Roles";
import AcademicAnalysis from "../models/AcademicAnalysis";
import CurricularAnalysis from "../models/CurricularAnalysis";
import Polo from "../models/Polo";
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
  updateCurricular,
  countDueFollowUps,
  listDueFollowUps,
  listStaleEnrollmentCases,
  setEnrollment
} from "../analysis/Store";
import { buildCommercialMessage, buildCommercialProposal, type CommercialProposalInput } from "../analysis/domain/commercial/proposal";
import { ticketFromTarget } from "../helpers/ChatTarget";
import { assertTicketAccess } from "../middleware/canAccessTicket";
import ShowTicketService from "../services/TicketServices/ShowTicketService";
import SendWhatsAppMessage from "../services/WbotServices/SendWhatsAppMessage";
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


// the name of the polo of each analysis (the view carries the id)
const withPolo = async <T extends { poloId: number | null }>(views: T[]): Promise<Array<T & { poloName: string | null }>> => {
  const ids = [...new Set(views.map(v => v.poloId).filter(Boolean))] as number[];
  const names = new Map((ids.length ? await Polo.findAll({ where: { id: ids }, attributes: ["id", "name"] }) : []).map(p => [p.id, p.name]));
  return views.map(v => ({ ...v, poloName: v.poloId ? names.get(v.poloId) || null : null }));
};
const viewOf = async (row: CurricularAnalysis, withSubjects = true): Promise<any> => (await withPolo([curricularView(row, withSubjects)]))[0];

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
  return res.json(await withPolo(rows.map(r => curricularView(r, false))));
};

export const curricularStore = async (req: Request, res: Response): Promise<Response> => {
  const { bytes, name } = fileOf(req);
  const b = req.body || {};
  // the consultant says who the analysis is for (before the PDF is read: reading may cost)
  const candidate = String(b.candidateName || "").replace(/\s+/g, " ").trim();
  if (candidate.length < 3) throw new AppError("Informe o nome do aluno.", 400);
  const polo = num(b.poloId) ? await Polo.findByPk(num(b.poloId) as number) : null;
  if (!polo || polo.active === false) throw new AppError("Informe o polo do aluno.", 400);
  const row = await createCurricular(me(req), bytes, name, {
    poloId: polo.id,
    entryPeriod: num(b.entryPeriod),
    startTerm: b.startTerm ? String(b.startTerm).trim() : undefined,
    leadId: num(b.leadId),
    contactId: num(b.contactId),
    candidateName: candidate
  });
  return res.status(201).json(await viewOf(row));
};

export const curricularShow = async (req: Request, res: Response): Promise<Response> => res.json(await viewOf(await loadCurricular(req)));

export const curricularUpdate = async (req: Request, res: Response): Promise<Response> => {
  const row = await loadCurricular(req);
  const b = req.body || {};
  const out = await updateCurricular(row, {
    entryPeriod: b.entryPeriod === undefined ? undefined : num(b.entryPeriod),
    startTerm: b.startTerm === undefined ? undefined : String(b.startTerm).trim(),
    leadId: b.leadId === undefined ? undefined : num(b.leadId),
    contactId: b.contactId === undefined ? undefined : num(b.contactId),
    poloId: b.poloId === undefined ? undefined : num(b.poloId),
    candidateName: b.candidateName
  });
  return res.json(await viewOf(out));
};

export const curricularSubject = async (req: Request, res: Response): Promise<Response> => {
  const row = await loadCurricular(req);
  const b = req.body || {};
  const out = await correctCurricularSubject(row, String(req.params.subjectId), { status: b.status, period: b.period === undefined ? undefined : Number(b.period), workload: b.workload === undefined ? undefined : Number(b.workload) });
  return res.json(await viewOf(out));
};

// ------------------------------------------------------------------ the 24-hour return and the commercial proposal

export const curricularEnrollment = async (req: Request, res: Response): Promise<Response> => {
  const row = await loadCurricular(req);
  const b = req.body || {};
  const out = await setEnrollment(row, me(req), { status: b.status, note: b.note, reanalysis: b.reanalysis === true });
  return res.json(await viewOf(out));
};

// returns waiting for an answer: the owner sees theirs, the management sees everyone's and the cases without enrollment for too long
export const followUps = async (req: Request, res: Response): Promise<Response> => {
  const scope = isManager(req) ? null : me(req);
  const [rows, total, stale] = await Promise.all([listDueFollowUps(scope, 20), countDueFollowUps(scope), isManager(req) ? listStaleEnrollmentCases(null, 6) : Promise.resolve([])]);
  const owners = new Map<number, string>();
  if (isManager(req)) {
    const ids = [...new Set([...rows, ...stale].map(r => r.userId).filter(Boolean))];
    (await User.findAll({ where: { id: ids }, attributes: ["id", "name"] })).forEach(u => owners.set(u.id, u.name));
  }
  const item = (r: CurricularAnalysis) => ({ id: r.id, candidateName: r.candidateName, courseName: r.courseName, dueAt: r.followUpDueAt, reanalysis: !!r.enrollmentReanalysisAt, status: r.enrollmentStatus, ownerName: owners.get(r.userId) || null, deliveredAt: r.enrollmentReanalysisAt || r.createdAt });
  return res.json({ total, due: rows.map(item), stale: stale.map(item) });
};

const proposalInputOf = (row: CurricularAnalysis): CommercialProposalInput => {
  const view = curricularView(row, false);
  const result: any = view.result || {};
  const totals = result.totals || { total: 0, exempted: 0, periods: [] };
  const sim = result.simulation;
  return {
    studentName: row.candidateName || null,
    courseName: row.courseName || null,
    totalSubjects: totals.total || 0,
    exemptedSubjects: totals.exempted || 0,
    totalPeriods: Math.max(0, ...(totals.periods || [0])),
    projectedPeriods: sim ? (sim.semestersRemaining ?? sim.semesters?.length ?? null) : null,
    estimatedCompletionTerm: sim?.estimatedCompletionTerm || null
  };
};

export const curricularProposal = async (req: Request, res: Response): Promise<Response> => {
  const row = await loadCurricular(req);
  const input = proposalInputOf(row);
  return res.json({ ...buildCommercialProposal(input), message: buildCommercialMessage(input) });
};

// the message of the proposal goes to the chosen contact (its open conversation, or a new one) and the analysis is linked to it
export const curricularSendProposal = async (req: Request, res: Response): Promise<Response> => {
  const row = await loadCurricular(req);
  if (row.status !== "COMPLETED") throw new AppError("A análise ainda não está pronta para ser enviada.", 400);
  const ticketId = await ticketFromTarget(req, req.body || {});
  await assertTicketAccess(req, ticketId, "send");
  const ticket = await ShowTicketService(ticketId);
  if (ticket.status === "closed") throw new AppError("Só é possível enviar para conversas abertas.", 400);
  if (ticket.isGroup) throw new AppError("A proposta tem dados do candidato: envie para um contato, não para um grupo.", 400);
  await SendWhatsAppMessage({ body: buildCommercialMessage(proposalInputOf(row)), ticket });
  if (!row.contactId) await row.update({ contactId: ticket.contactId });
  return res.json({ ok: true, ticketId });
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
    if (email && !isEmail(email)) throw new AppError("E-mail inválido.", 400);
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
