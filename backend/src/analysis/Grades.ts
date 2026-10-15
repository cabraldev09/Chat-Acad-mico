import { createHash } from "crypto";
import fs from "fs";
import path from "path";
import { Op } from "sequelize";

import { PUBLIC_DIR } from "../config/paths";
import AppError from "../errors/AppError";
import CommercialGrade from "../models/CommercialGrade";
import { logger } from "../utils/logger";
import { cleanReadingText, readCommercialGrade, type CommercialGradeReading } from "./services/commercial-grades/reader";

// The catalog of commercial matrices. Reading is local (columns of the SIAA PDF); the same matrix is kept once: the
// same PDF is recognized by its hash and a new version of the same course and modality replaces the old one.

export const GRADE_MAX_BYTES = 8 * 1024 * 1024;
const GRADES_DIR = path.join(PUBLIC_DIR, "grades");

const fingerprint = (value: Buffer | string): string => createHash("sha256").update(value).digest("hex");
const norm = (value: string | null | undefined): string => (value ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toUpperCase();

export type PublishAction = "created" | "updated" | "unchanged";
export interface PublishResult {
  id: number;
  action: PublishAction;
  warning: boolean;
  message: string;
  courseName: string;
}

export const gradePath = (g: Pick<CommercialGrade, "fileName">): string => path.join(GRADES_DIR, g.fileName);

const parse = <T>(raw: string | null | undefined, fallback: T): T => {
  try {
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch (e) {
    return fallback;
  }
};

export const gradeView = (g: CommercialGrade, withSummary = false) => ({
  id: g.id,
  courseName: g.courseName,
  modality: g.modality,
  curriculumTerm: g.curriculumTerm,
  degree: g.degree,
  knowledgeArea: g.knowledgeArea,
  durationSemesters: g.durationSemesters,
  courseTracks: parse(g.courseTracks, []),
  internshipInfo: g.internshipInfo,
  hasTcc: g.hasTcc,
  totalInternshipHours: g.totalInternshipHours,
  totalCourseHours: g.totalCourseHours,
  complete: g.complete,
  originalName: g.originalName,
  sizeBytes: g.sizeBytes,
  updatedAt: g.updatedAt,
  createdAt: g.createdAt,
  ...(withSummary ? { whatsappSummary: g.whatsappSummary } : {})
});

const messageOf = (reading: CommercialGradeReading, updated: boolean): { message: string; warning: boolean } => {
  const done = updated ? "Grade atualizada" : "Grade disponibilizada";
  if (reading.complete !== false) return { warning: false, message: `${done}: lida do PDF; confira os dados antes do envio.` };
  return { warning: true, message: `${done}, mas o PDF não trouxe todos os dados (curso, carga horária ou duração); revise antes do envio.` };
};

/**
 * Reads the PDF and publishes the matrix. With `upsert` (batch upload and the first import) the same PDF is "unchanged" and
 * a matrix of the same course and modality (even with another term) is updated instead of refused.
 */
export const publishGrade = async (input: { bytes: Buffer; filename: string; userId: number | null; upsert?: boolean; degreeHint?: string }): Promise<PublishResult> => {
  const { bytes, filename, userId, upsert, degreeHint } = input;
  if (bytes.length === 0) throw new AppError("O arquivo está vazio.", 400);
  if (bytes.length > GRADE_MAX_BYTES) throw new AppError(`O PDF excede o limite de ${Math.round(GRADE_MAX_BYTES / 1024 / 1024)} MB.`, 413);
  if (bytes.subarray(0, 5).toString("latin1") !== "%PDF-") throw new AppError("O arquivo não é um PDF válido.", 400);

  const contentHash = fingerprint(bytes);
  const sameFile = await CommercialGrade.findOne({ where: { contentHash } });
  if (sameFile) {
    if (upsert) return { id: sameFile.id, action: "unchanged", warning: false, courseName: sameFile.courseName, message: `“${sameFile.courseName}” já estava atualizada (mesmo PDF).` };
    throw new AppError(`Este mesmo PDF já está disponível como “${sameFile.courseName}”.`, 409);
  }

  const reading = await readCommercialGrade(bytes, filename);
  if (degreeHint && !reading.degree) reading.degree = degreeHint;
  const courseName = reading.courseName || cleanReadingText(filename.replace(/\.pdf$/i, ""), 180) || "Grade sem nome";
  const catalogKey = fingerprint(`${norm(courseName)}|${norm(reading.modality)}|${norm(reading.curriculumTerm)}`);

  let previous: CommercialGrade | null = null;
  if (upsert) {
    // same course and modality: it is the new version of the matrix (prefers the same term, else the most recent)
    const candidates = await CommercialGrade.findAll({ where: { courseName: { [Op.iLike]: courseName } }, order: [["updatedAt", "DESC"]] });
    const sameModality = candidates.filter(c => norm(c.modality) === norm(reading.modality));
    previous = sameModality.find(c => norm(c.curriculumTerm) === norm(reading.curriculumTerm)) ?? sameModality[0] ?? null;
  }
  const sameMatrix = await CommercialGrade.findOne({ where: { catalogKey, ...(previous ? { id: { [Op.ne]: previous.id } } : {}) } as any });
  if (sameMatrix) throw new AppError(`Já existe uma matriz de “${sameMatrix.courseName}”${sameMatrix.curriculumTerm ? ` (${sameMatrix.curriculumTerm})` : ""}. Exclua a versão anterior antes de ${previous ? "atualizar" : "publicar outra"}.`, 409);

  fs.mkdirSync(GRADES_DIR, { recursive: true });
  const fileName = `${contentHash}.pdf`;
  fs.writeFileSync(path.join(GRADES_DIR, fileName), bytes);
  const data: any = {
    courseName,
    modality: reading.modality,
    curriculumTerm: reading.curriculumTerm,
    degree: reading.degree,
    knowledgeArea: reading.knowledgeArea,
    durationSemesters: reading.durationSemesters,
    courseTracks: JSON.stringify(reading.courseTracks || []),
    internshipInfo: reading.internshipInfo,
    hasTcc: reading.hasTcc,
    totalInternshipHours: reading.totalInternshipHours,
    totalCourseHours: reading.totalCourseHours,
    whatsappSummary: reading.whatsappSummary,
    complete: reading.complete !== false,
    contentHash,
    catalogKey,
    originalName: filename.slice(0, 255),
    fileName,
    sizeBytes: bytes.length,
    uploadedById: userId
  };
  let row: CommercialGrade;
  try {
    if (previous) {
      const oldFile = gradePath(previous);
      await previous.update(data);
      row = previous;
      if (oldFile !== gradePath(row)) fs.rmSync(oldFile, { force: true });
    } else {
      row = await CommercialGrade.create(data);
    }
  } catch (err) {
    // without a record the file would be an orphan
    fs.rmSync(path.join(GRADES_DIR, fileName), { force: true });
    throw err;
  }
  const notice = messageOf(reading, !!previous);
  return { id: row.id, action: previous ? "updated" : "created", warning: notice.warning, message: notice.message, courseName };
};

export const removeGrade = async (g: CommercialGrade): Promise<void> => {
  fs.rmSync(gradePath(g), { force: true });
  await g.destroy();
};

// The first start (and the "Importar grades padrão" button): the matrices that come with the system are read and
// published; what is already there is not touched.
export const importDefaultGrades = async (): Promise<{ created: number; updated: number; unchanged: number; failed: string[] }> => {
  const root = path.join(__dirname, "..", "..", "data", "grades");
  const out = { created: 0, updated: 0, unchanged: 0, failed: [] as string[] };
  if (!fs.existsSync(root)) return out;
  const files: Array<{ file: string; hint?: string }> = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.isFile() && /\.pdf$/i.test(entry.name)) files.push({ file: path.join(root, entry.name) });
    if (entry.isDirectory()) {
      for (const inner of fs.readdirSync(path.join(root, entry.name))) {
        if (/\.pdf$/i.test(inner)) files.push({ file: path.join(root, entry.name, inner), hint: entry.name === "pos" ? "Pós-graduação" : undefined });
      }
    }
  }
  for (const { file, hint } of files) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const r = await publishGrade({ bytes: fs.readFileSync(file), filename: path.basename(file), userId: null, upsert: true, degreeHint: hint });
      out[r.action] += 1;
    } catch (err) {
      out.failed.push(`${path.basename(file)}: ${(err as Error).message}`);
    }
  }
  logger.info(`default grades imported: ${out.created} created, ${out.updated} updated, ${out.unchanged} unchanged, ${out.failed.length} failed`);
  return out;
};

// at the first start, when the catalog is empty
export const importDefaultGradesIfEmpty = async (): Promise<void> => {
  if ((await CommercialGrade.count()) > 0) return;
  await importDefaultGrades();
};
