import { compare, hash } from "bcryptjs";
import { NextFunction, Request, Response } from "express";
import { sign, verify } from "jsonwebtoken";
import { Op, fn, col, where } from "sequelize";

import AppError from "../errors/AppError";
import authConfig from "../config/auth";
import AcademicAnalysis from "../models/AcademicAnalysis";
import Student from "../models/Student";
import StudentToken from "../models/StudentToken";
import { academicView, createAcademic, currentAcademicOf, findValidToken, issueToken } from "../analysis/Store";
import { mailConfigured, sendMail } from "../services/MailServices/SendMail";
import { studentLinkMail } from "../services/MailServices/Templates";
import { logger } from "../utils/logger";

// The Portal do Aluno: its own login (RGM or e-mail + password the student chose), its own token, and access only to
// the student's own analysis. A student has no permission anywhere else in the system.

const MIN_PASSWORD = 8;
const frontBase = (): string => String(process.env.FRONTEND_URL || "").split(",")[0].trim().replace(/\/$/, "") || "http://localhost:3000";

// a token for students is signed with another secret: a student token never works as a user token and vice versa
const studentSecret = (): string => `${authConfig.secret}|student`;

const signStudent = (s: Student): string => sign({ sid: s.id, v: s.sessionVersion || 0, aud: "student" }, studentSecret(), { expiresIn: "12h" });

export const isStudentAuth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const header = req.headers.authorization;
  if (!header) throw new AppError("ERR_SESSION_EXPIRED", 401);
  const [, token] = header.split(" ");
  let payload: any;
  try {
    payload = verify(token, studentSecret());
  } catch (e) {
    throw new AppError("ERR_SESSION_EXPIRED", 401);
  }
  if (!payload || payload.aud !== "student") throw new AppError("ERR_SESSION_EXPIRED", 401);
  // checked against the database on every request: blocking or a new password cuts the access at once
  const student = await Student.findByPk(payload.sid);
  if (!student || student.blockedAt || !student.activatedAt || (student.sessionVersion || 0) !== payload.v) throw new AppError("ERR_SESSION_EXPIRED", 401);
  req.student = student;
  return next();
};

const byLogin = async (login: string): Promise<Student | null> => {
  const v = String(login || "").trim();
  if (!v) return null;
  if (v.includes("@")) return Student.findOne({ where: where(fn("lower", col("email")), v.toLowerCase()) });
  return Student.findOne({ where: { rgm: v.replace(/\s+/g, "") } });
};

const sameAnswer = (res: Response): Response => res.status(200).json({ ok: true });

export const login = async (req: Request, res: Response): Promise<Response> => {
  const student = await byLogin(String(req.body?.login || ""));
  const password = String(req.body?.password || "");
  // the same error for a wrong login, a wrong password, a blocked or a not yet activated account
  const bad = new AppError("RGM, e-mail ou senha incorretos.", 401);
  if (!student || !student.passwordHash || !student.activatedAt || student.blockedAt) {
    await compare(password, "$2a$08$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidi").catch(() => false);
    throw bad;
  }
  if (!(await compare(password, student.passwordHash))) throw bad;
  await student.update({ lastLoginAt: new Date() });
  return res.json({ token: signStudent(student), student: { id: student.id, name: student.name, rgm: student.rgm, courseName: student.courseName } });
};

// the link of the invitation or of the recovery: is it still good?
export const checkToken = async (req: Request, res: Response): Promise<Response> => {
  const t = await findValidToken(String(req.params.token || ""));
  return res.json({ valid: !!t, kind: t ? t.kind : null, name: t && t.student ? t.student.name.split(/\s+/)[0] : null });
};

// choosing the password: from the invitation (activates) or from a recovery link
export const activate = async (req: Request, res: Response): Promise<Response> => {
  const password = String(req.body?.password || "");
  if (password.length < MIN_PASSWORD) throw new AppError("A senha precisa ter pelo menos 8 caracteres.", 400);
  const t = await findValidToken(String(req.body?.token || ""));
  if (!t || !t.student) throw new AppError("Este link não vale mais. Peça um novo link à sua equipe acadêmica.", 400);
  const student = t.student;
  if (student.blockedAt) throw new AppError("Este acesso está bloqueado. Procure a sua equipe acadêmica.", 400);
  await student.update({ passwordHash: await hash(password, 10), activatedAt: student.activatedAt || new Date(), sessionVersion: (student.sessionVersion || 0) + 1 });
  await StudentToken.update({ usedAt: new Date() }, { where: { studentId: student.id, usedAt: null } as any });
  return res.json({ ok: true });
};

// "esqueci a senha": the same answer for everybody; the e-mail goes out in the background
export const forgot = async (req: Request, res: Response): Promise<Response> => {
  const student = await byLogin(String(req.body?.login || ""));
  if (student && student.email && student.activatedAt && !student.blockedAt && (await mailConfigured())) {
    const recent = await StudentToken.count({ where: { studentId: student.id, kind: "reset", createdAt: { [Op.gt]: new Date(Date.now() - 3600000) } } });
    if (recent < 3) {
      const token = await issueToken(student, "reset");
      sendMail({ to: student.email, ...studentLinkMail("reset", student.name, `${frontBase()}/portal/ativar/${token}`, "1 hora") }).catch(err => logger.warn(`student reset mail not sent: ${(err as Error).message}`));
    }
  }
  return sameAnswer(res);
};

const versionsOf = async (studentId: number) => {
  const all = await AcademicAnalysis.findAll({ where: { studentId }, order: [["version", "DESC"]] });
  return all.map(a => ({ id: a.id, version: a.version, isCurrent: a.isCurrent, origin: a.origin, documentType: a.documentType, createdAt: a.createdAt, changeSummary: academicView(a, false).changeSummary }));
};

export const me = async (req: Request, res: Response): Promise<Response> => {
  const s = req.student as Student;
  const current = await currentAcademicOf(s.id);
  return res.json({
    student: { id: s.id, name: s.name, rgm: s.rgm, email: s.email, courseName: s.courseName },
    current: current ? academicView(current) : null,
    versions: await versionsOf(s.id)
  });
};

export const version = async (req: Request, res: Response): Promise<Response> => {
  const s = req.student as Student;
  // only the student's own versions: an id typed in the address of another student's analysis finds nothing
  const row = await AcademicAnalysis.findOne({ where: { id: req.params.id, studentId: s.id } });
  if (!row) throw new AppError("Versão não encontrada.", 404);
  return res.json(academicView(row));
};

// The student sends a new extract or history. The same file or the same facts do not create a version.
export const upload = async (req: Request, res: Response): Promise<Response> => {
  const s = req.student as Student;
  const file = (req as any).file as Express.Multer.File | undefined;
  if (!file || !file.buffer) throw new AppError("Escolha um arquivo PDF.", 400);
  const { analysis, reused } = await createAcademic(null, file.buffer, file.originalname || "documento.pdf", { student: s, origin: "STUDENT_UPLOAD" });
  return res.status(reused ? 200 : 201).json({ reused, current: academicView(analysis), versions: await versionsOf(s.id) });
};

export const changePassword = async (req: Request, res: Response): Promise<Response> => {
  const s = req.student as Student;
  const next = String(req.body?.newPassword || "");
  if (next.length < MIN_PASSWORD) throw new AppError("A nova senha precisa ter pelo menos 8 caracteres.", 400);
  if (!s.passwordHash || !(await compare(String(req.body?.password || ""), s.passwordHash))) throw new AppError("A senha atual não confere.", 400);
  // the new password asks for a new login everywhere
  await s.update({ passwordHash: await hash(next, 10), sessionVersion: (s.sessionVersion || 0) + 1 });
  return res.json({ ok: true });
};
