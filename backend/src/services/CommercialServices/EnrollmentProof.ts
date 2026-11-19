import { randomBytes } from "crypto";
import fs from "fs";
import path from "path";

import { PUBLIC_DIR } from "../../config/paths";
import AppError from "../../errors/AppError";
import EnrollmentProof from "../../models/EnrollmentProof";
import { PrintReadError, readImageWithTool } from "./CoursePrint";

// The print of the enrollment (the institution's screen or receipt) that the consultant attaches when confirming it: the model reads the
// RGM (and the name and course, to check), the file is kept with the enrollment for the management to see. The RGM read only fills the
// field: the consultant confirms it.
export const PROOF_DIR = path.join(PUBLIC_DIR, "enrollment-proofs");
const TOOL = {
  name: "registrar_matricula",
  description: "Registra os dados da matrícula que aparecem no print.",
  input_schema: {
    type: "object",
    properties: {
      rgm: { type: "string", description: "O RGM (registro/matrícula do aluno), só os caracteres do número como aparece no print" },
      nome: { type: "string", description: "Nome do aluno, como escrito" },
      curso: { type: "string", description: "Curso, como escrito" },
      polo: { type: "string", description: "Polo, como escrito" }
    },
    required: []
  }
};
const SYSTEM =
  "Você lê o print de uma matrícula (tela do sistema da instituição, comprovante ou e-mail) e devolve os dados chamando a ferramenta. " +
  "Copie exatamente como está escrito, sem inventar. O RGM é o número de registro/matrícula do aluno (às vezes chamado RA ou matrícula). " +
  "Se o print não mostrar um dado, deixe o campo vazio.";

export interface ProofReading { rgm: string | null; name: string | null; course: string | null; polo: string | null }

const clean = (v: unknown, max: number): string | null => {
  const s = String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
  return s || null;
};
export const cleanProofReading = (input: any): ProofReading => {
  const i = input && typeof input === "object" ? input : {};
  const rgm = String(i.rgm ?? "").replace(/^(rgm|ra|matr[ií]cula)\s*[:\-]?\s*/i, "").replace(/\s+/g, "").replace(/[^A-Za-z0-9.\-/]/g, "").slice(0, 40);
  return { rgm: rgm.length >= 3 ? rgm : null, name: clean(i.nome, 200), course: clean(i.curso, 200), polo: clean(i.polo, 200) };
};

export const readEnrollmentProof = async (bytes: Buffer, mime: string): Promise<ProofReading> =>
  cleanProofReading(await readImageWithTool(bytes, mime, TOOL, SYSTEM, "Este é o print da matrícula. Registre o RGM e os dados que ele mostra.", "print da matrícula"));

const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "application/pdf": "pdf" };

// keeps the file and tries to read it (a reading that fails keeps the file and says why)
export const storeProof = async (leadId: number, file: { buffer: Buffer; mimetype: string; originalname?: string; size: number }, userId: number | null) => {
  const ext = EXT[file.mimetype];
  if (!ext) throw new AppError("Envie uma imagem (PNG, JPG ou WEBP) ou um PDF.", 400);
  fs.mkdirSync(PROOF_DIR, { recursive: true });
  const fileName = `${randomBytes(18).toString("hex")}.${ext}`;
  fs.writeFileSync(path.join(PROOF_DIR, fileName), file.buffer);
  let reading: ProofReading = { rgm: null, name: null, course: null, polo: null };
  let readNote: string | null = null;
  try {
    reading = await readEnrollmentProof(file.buffer, file.mimetype);
    if (!reading.rgm) readNote = "Não encontrei o RGM no print: digite o número.";
  } catch (err) {
    readNote = err instanceof PrintReadError ? err.message : "Não consegui ler o print agora: digite o RGM.";
  }
  const row = await EnrollmentProof.create({
    leadId, fileName, originalName: (file.originalname || "").slice(0, 200) || null, mime: file.mimetype, size: file.size,
    rgmRead: reading.rgm, nameRead: reading.name, courseRead: reading.course, readNote, uploadedById: userId
  } as any);
  return { id: row.id, reading, readNote };
};

// the print becomes the proof of that enrollment (the first one, or the extra course)
export const attachProof = async (leadId: number, proofId: number, enrollmentId: number | null): Promise<void> => {
  const row = await EnrollmentProof.findOne({ where: { id: proofId, leadId } });
  if (!row) return;
  await row.update({ enrollmentId, attachedAt: new Date() } as any);
};

export const proofFilePath = (row: EnrollmentProof): string | null => {
  if (!/^[a-f0-9]{36}\.(png|jpg|webp|pdf)$/.test(row.fileName)) return null;
  const full = path.join(PROOF_DIR, row.fileName);
  return fs.existsSync(full) ? full : null;
};
