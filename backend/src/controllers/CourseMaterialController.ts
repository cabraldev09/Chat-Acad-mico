import { randomBytes } from "crypto";
import { Request, Response } from "express";
import fs from "fs";
import path from "path";

import { PUBLIC_DIR } from "../config/paths";
import AppError from "../errors/AppError";
import { ticketFromTarget } from "../helpers/ChatTarget";
import { isManagerRole, roleOf } from "../helpers/Roles";
import { assertTicketAccess } from "../middleware/canAccessTicket";
import Course from "../models/Course";
import CourseMaterial from "../models/CourseMaterial";
import CourseRegulation from "../models/CourseRegulation";
import User from "../models/User";
import { areaOfCourse } from "../services/CommercialServices/MecDefaults";
import { mecRequirementOf } from "../services/CommercialServices/MecAreas";
import { PrintReadError, readCoursePrint } from "../services/CommercialServices/CoursePrint";
import { isStandardText } from "../services/CommercialServices/MecDefaults";
import ShowTicketService from "../services/TicketServices/ShowTicketService";
import SendWhatsAppMedia from "../services/WbotServices/SendWhatsAppMedia";

// THE COMMERCIAL AREA OF THE COURSES: each course with the format and the practical share that the MEC asks for, the text the institution approved and the prints
// it sent. The management attaches a print, the AI reads it, and what is confirmed is what the agent and the consultants say. Everybody who sells reads it and
// sends the print to a lead.
const DIR = path.join(PUBLIC_DIR, "course-materials");
const TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "application/pdf": "pdf" };
export const MATERIAL_MAX_BYTES = 8 * 1024 * 1024;

const manager = (req: Request): boolean => isManagerRole(roleOf(req.user as any));
const mustManage = (req: Request): void => { if (!manager(req)) throw new AppError("ERR_NO_PERMISSION", 403); };
const num = (v: unknown): number | null => (v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const pct = (v: unknown, label: string): number | null => {
  const n = num(v);
  if (n === null) return null;
  if (n < 0 || n > 100) throw new AppError(`${label} precisa ser de 0 a 100.`, 400);
  return Math.round(n * 100) / 100;
};

const materialView = (m: CourseMaterial, names: Map<number, string>) => ({
  id: m.id, courseId: m.courseId, kind: m.kind, originalName: m.originalName, mime: m.mime, size: m.size,
  readStatus: m.readStatus, readNote: m.readNote || null,
  reading: { text: m.readText || null, format: m.readFormat || null, percent: m.readPercent === null || m.readPercent === undefined ? null : Number(m.readPercent), syncPercent: m.readSyncPercent === null || m.readSyncPercent === undefined ? null : Number(m.readSyncPercent) },
  status: m.status, uploadedBy: m.uploadedById ? names.get(m.uploadedById) || null : null, confirmedBy: m.confirmedById ? names.get(m.confirmedById) || null : null,
  confirmedAt: m.confirmedAt, createdAt: m.createdAt
});

const userNames = async (rows: CourseMaterial[]): Promise<Map<number, string>> => {
  const ids = [...new Set(rows.flatMap(r => [r.uploadedById, r.confirmedById]).filter(Boolean))] as number[];
  return new Map((ids.length ? await User.findAll({ where: { id: ids }, attributes: ["id", "name"] }) : []).map(u => [u.id, u.name]));
};

// the list of the courses with what the MEC asks of each, the text in use and how many prints wait for a confirmation
export const index = async (_req: Request, res: Response): Promise<Response> => {
  const [courses, rules, materials] = await Promise.all([
    Course.findAll({ where: { active: true } as any, attributes: ["id", "name", "modality", "semesters"], order: [["name", "ASC"]] }),
    CourseRegulation.findAll({ where: { intakeTerm: null } as any }),
    CourseMaterial.findAll({ attributes: ["id", "courseId", "status"] })
  ]);
  const rule = new Map(rules.map(r => [r.courseId, r]));
  const out = [];
  for (const c of courses) {
    const r = rule.get(c.id) || null;
    // eslint-disable-next-line no-await-in-loop
    const mec = mecRequirementOf(await areaOfCourse(c), r);
    const own = materials.filter(m => m.courseId === c.id);
    const approved = r && r.commercialApprovedText && !isStandardText(r.commercialApprovedText) ? r.commercialApprovedText : null;
    out.push({ id: c.id, name: c.name, modality: c.modality, semesters: c.semesters || null, mec, approvedText: approved, prints: own.length, waiting: own.filter(m => m.status === "pending").length });
  }
  return res.json({ courses: out, canManage: manager(_req) });
};

export const list = async (req: Request, res: Response): Promise<Response> => {
  const course = await Course.findByPk(req.params.id, { attributes: ["id", "name", "modality", "semesters"] });
  if (!course) throw new AppError("Curso não encontrado.", 404);
  const rows = await CourseMaterial.findAll({ where: { courseId: course.id } as any, order: [["createdAt", "DESC"]] });
  const r = await CourseRegulation.findOne({ where: { courseId: course.id, intakeTerm: null } as any });
  const names = await userNames(rows);
  return res.json({
    course: { id: course.id, name: course.name, modality: course.modality, semesters: course.semesters || null, mec: mecRequirementOf(await areaOfCourse(course), r),
      approvedText: r && r.commercialApprovedText && !isStandardText(r.commercialApprovedText) ? r.commercialApprovedText : null },
    materials: rows.map(m => materialView(m, names)), canManage: manager(req)
  });
};

// a print is attached (management only) and read by the AI right away; without a key or when the reading fails it waits to be filled in by hand
export const upload = async (req: Request, res: Response): Promise<Response> => {
  mustManage(req);
  const course = await Course.findByPk(req.params.id, { attributes: ["id", "name"] });
  if (!course) throw new AppError("Curso não encontrado.", 404);
  const file = (req as any).file as Express.Multer.File | undefined;
  if (!file || !file.buffer || !file.buffer.length) throw new AppError("Envie o print do curso (imagem ou PDF).", 400);
  const ext = TYPES[file.mimetype];
  if (!ext) throw new AppError("Envie uma imagem PNG, JPG ou WEBP, ou um PDF.", 400);
  if (file.buffer.length > MATERIAL_MAX_BYTES) throw new AppError("O arquivo passa de 8 MB.", 413);
  fs.mkdirSync(DIR, { recursive: true });
  const fileName = `${randomBytes(18).toString("hex")}.${ext}`;
  fs.writeFileSync(path.join(DIR, fileName), file.buffer);
  const row = await CourseMaterial.create({ courseId: course.id, kind: "print", fileName, originalName: (file.originalname || `print.${ext}`).slice(0, 255), mime: file.mimetype, size: file.buffer.length, uploadedById: Number(req.user.id), status: "pending", readStatus: "pending" } as any);
  try {
    const read = await readCoursePrint(file.buffer, file.mimetype, course.name);
    await row.update({ readStatus: read.text || read.percent !== null ? "read" : "failed", readNote: read.text || read.percent !== null ? (read.course && read.course.toLowerCase() !== course.name.toLowerCase() ? `O print fala do curso “${read.course}”: confira se é este curso.` : null) : "A IA não encontrou texto nem percentual no print: preencha à mão.", readText: read.text, readFormat: read.format, readPercent: read.percent, readSyncPercent: read.syncPercent } as any);
  } catch (err) {
    await row.update({ readStatus: "manual", readNote: err instanceof PrintReadError ? err.message : "A IA não conseguiu ler o print: preencha à mão." } as any);
  }
  const names = await userNames([row]);
  return res.status(201).json(materialView(row, names));
};

const load = async (id: string): Promise<CourseMaterial> => {
  const row = await CourseMaterial.findByPk(id);
  if (!row) throw new AppError("Material não encontrado.", 404);
  return row;
};

export const file = async (req: Request, res: Response): Promise<void> => {
  const row = await load(req.params.id);
  const full = path.join(DIR, row.fileName);
  if (!/^[a-f0-9]{36}\.(png|jpg|webp|pdf)$/.test(row.fileName) || !fs.existsSync(full)) throw new AppError("O arquivo deste material não está mais disponível.", 410);
  res.setHeader("Content-Type", row.mime);
  res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(row.originalName || row.fileName)}`);
  res.setHeader("Cache-Control", "private, no-store");
  fs.createReadStream(full).pipe(res);
};

// what was read (corrected if needed) becomes the rule of the course: the agent and the consultants say it from now on
export const confirm = async (req: Request, res: Response): Promise<Response> => {
  mustManage(req);
  const row = await load(req.params.id);
  const b = req.body || {};
  const text = String(b.text ?? row.readText ?? "").replace(/\p{Extended_Pictographic}/gu, "").trim().slice(0, 2000);
  const percent = b.percent === undefined ? (row.readPercent === null || row.readPercent === undefined ? null : Number(row.readPercent)) : pct(b.percent, "O percentual presencial");
  const sync = b.syncPercent === undefined ? (row.readSyncPercent === null || row.readSyncPercent === undefined ? null : Number(row.readSyncPercent)) : pct(b.syncPercent, "O percentual ao vivo");
  if (text.length < 10 && percent === null) throw new AppError("Informe o texto aprovado (ao menos 10 letras) ou o percentual presencial.", 400);
  const values: Record<string, unknown> = {};
  if (text.length >= 10) values.commercialApprovedText = text;
  if (percent !== null) { values.percentualPresencial = percent; values.mecImpacted = percent > 0; values.praticaPresencial = percent > 0; }
  if (sync !== null) values.percentualSincrono = sync;
  const existing = await CourseRegulation.findOne({ where: { courseId: row.courseId, intakeTerm: null } as any });
  if (existing) await existing.update(values as any);
  else await CourseRegulation.create({ courseId: row.courseId, intakeTerm: null, ...values } as any);
  await row.update({ status: "confirmed", confirmedById: Number(req.user.id), confirmedAt: new Date(), readText: text || row.readText, readPercent: percent, readSyncPercent: sync } as any);
  // the other prints of the course that were waiting are no longer the current one
  const names = await userNames([row]);
  return res.json(materialView(row, names));
};

export const discard = async (req: Request, res: Response): Promise<Response> => {
  mustManage(req);
  const row = await load(req.params.id);
  fs.rmSync(path.join(DIR, row.fileName), { force: true });
  await row.destroy();
  return res.status(204).end();
};

// the print goes to the chosen contact (its open conversation, or a new one), as an image with the course in the caption
export const send = async (req: Request, res: Response): Promise<Response> => {
  const row = await load(req.params.id);
  const course = await Course.findByPk(row.courseId, { attributes: ["name"] });
  const ticketId = await ticketFromTarget(req, req.body || {}, { allowGroups: true });
  await assertTicketAccess(req, ticketId, "send");
  const ticket = await ShowTicketService(ticketId);
  if (ticket.status === "closed") throw new AppError("Só é possível enviar para conversas abertas.", 400);
  const source = path.join(DIR, row.fileName);
  if (!fs.existsSync(source)) throw new AppError("O arquivo deste material não está mais disponível.", 410);
  // SendWhatsAppMedia consumes the file it sends: hand it a copy
  const ext = TYPES[row.mime] || "bin";
  const copyName = `material-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
  fs.copyFileSync(source, path.join(PUBLIC_DIR, copyName));
  const name = `${(course && course.name) || "Curso"}.${ext}`.replace(/[\\/:*?"<>|]/g, "_");
  await SendWhatsAppMedia({ media: { filename: copyName, originalname: name, mimetype: row.mime, path: path.join(PUBLIC_DIR, copyName) } as Express.Multer.File, ticket, body: String(req.body?.caption || "").slice(0, 900), displayName: name });
  return res.json({ ok: true, ticketId });
};
