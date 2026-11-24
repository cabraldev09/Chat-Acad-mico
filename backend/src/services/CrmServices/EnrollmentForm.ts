import { randomBytes } from "crypto";
import { Op } from "sequelize";
import fs from "fs";
import path from "path";

import AppError from "../../errors/AppError";
import { PUBLIC_DIR } from "../../config/paths";
import { isValidCpf } from "../../helpers/Cpf";
import { openBytes, openSecret, sealBytes, sealSecret } from "../../helpers/Secrets";
import { getIO } from "../../libs/socket";
import Contact from "../../models/Contact";
import Course from "../../models/Course";
import EnrollmentForm from "../../models/EnrollmentForm";
import Lead from "../../models/Lead";
import LeadDocument from "../../models/LeadDocument";
import { logger } from "../../utils/logger";
import { frontBase } from "../MailServices/Notify";
import { notify } from "../NotificationServices/Notify";
import { ensureDocuments, setDocumentStatus } from "./Documents";
import { addActivity, loadLead } from "./LeadCore";

// THE ENROLLMENT FORM ("ficha de matrícula"). The lead gets a personal link and fills in, on the phone, the data the institution asks for
// and the picture of the ID (camera or gallery, or a PDF). Every change is kept at once (the person can stop and come back), the page shows
// how far it went, and nothing is sent before the person agrees with the use of the data (LGPD). What is typed is kept sealed in the database
// and the pictures are kept sealed on disk, outside the public folder: only the team, logged in, reads them. When it is sent the lead's record
// is updated (name, CPF, e-mail, city) and the documents count as delivered; the e-mail goes to the student of the portal at the enrollment.

export const FIELDS: Array<{ key: string; label: string; optional?: boolean }> = [
  { key: "nome", label: "Nome completo" },
  { key: "nascimento", label: "Data de nascimento" },
  { key: "cpf", label: "CPF" },
  { key: "rgNumero", label: "Número do RG" },
  { key: "rgOrgao", label: "Órgão emissor do RG" },
  { key: "rgUf", label: "UF do RG" },
  { key: "mae", label: "Nome completo da mãe" },
  { key: "cep", label: "CEP" },
  { key: "rua", label: "Rua" },
  { key: "numero", label: "Número" },
  { key: "complemento", label: "Complemento", optional: true },
  { key: "bairro", label: "Bairro" },
  { key: "cidade", label: "Cidade" },
  { key: "uf", label: "UF do endereço" },
  { key: "celular", label: "Telefone celular" },
  { key: "email", label: "E-mail pessoal" }
];
export const FILE_KINDS: Record<string, { label: string; optional?: boolean }> = {
  doc_frente: { label: "RG ou CNH (frente)" },
  doc_verso: { label: "RG ou CNH (verso)" },
  historico: { label: "Histórico do ensino médio", optional: true }
};
const UFS = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"];
const VALID_DAYS = 30;
const MAX_FILE = 10 * 1024 * 1024;

export const CONSENT_TEXT =
  "Autorizo o uso dos meus dados e dos documentos enviados apenas para a minha matrícula e o meu cadastro de aluno, conforme a Lei Geral de Proteção de Dados (LGPD). Sei que posso pedir a correção ou a exclusão deles a qualquer momento.";

// the pictures live sealed outside the public folder (FICHA_DIR, else a "fichas" folder beside the uploads, on the same volume)
const DIR = (): string => process.env.FICHA_DIR || path.join(path.dirname(PUBLIC_DIR), "fichas");

export interface StoredFile {
  kind: string;
  file: string;
  name: string;
  mime: string;
  size: number;
  at: string;
}

const digits = (v: unknown): string => String(v || "").replace(/\D/g, "");
const clean = (v: unknown, max = 160): string => String(v ?? "").replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

export const dataOf = (form: EnrollmentForm): Record<string, string> => {
  try {
    return form.data ? JSON.parse(openSecret(form.data)) || {} : {};
  } catch (e) {
    return {};
  }
};
export const filesOf = (form: EnrollmentForm): StoredFile[] => {
  try {
    const list = form.files ? JSON.parse(form.files) : [];
    return Array.isArray(list) ? list : [];
  } catch (e) {
    return [];
  }
};

// each field as it is kept: digits for documents and phones, upper case for the states, a real date, a real e-mail
export const normalizeField = (key: string, value: unknown): string => {
  const v = clean(value, key === "email" ? 120 : 160);
  if (["cpf", "cep", "celular"].includes(key)) return digits(v).slice(0, key === "celular" ? 13 : key === "cpf" ? 11 : 8);
  if (key === "rgUf" || key === "uf") return v.toUpperCase().slice(0, 2);
  if (key === "rgNumero") return v.replace(/[^0-9A-Za-z.\-/]/g, "").slice(0, 20);
  if (key === "email") return v.toLowerCase().replace(/\s/g, "");
  if (key === "nascimento") return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "";
  return v;
};

// the problem of a field, in words the person understands (or null when it is right); empty is "missing", not wrong
export const problemOf = (key: string, value: string): string | null => {
  if (!value) return null;
  switch (key) {
    case "nome":
    case "mae":
      return value.split(" ").filter(Boolean).length < 2 ? "Escreva o nome completo, com sobrenome." : null;
    case "cpf":
      return isValidCpf(value) ? null : "Confira o CPF: os números não batem.";
    case "nascimento": {
      const d = new Date(`${value}T12:00:00`);
      const age = (Date.now() - d.getTime()) / (365.25 * 864e5);
      return Number.isNaN(d.getTime()) || age < 14 || age > 100 ? "Confira a data de nascimento." : null;
    }
    case "rgUf":
    case "uf":
      return UFS.includes(value) ? null : "Use a sigla do estado, como RO ou SP.";
    case "cep":
      return value.length === 8 ? null : "O CEP tem 8 números.";
    case "celular":
      return value.length >= 10 && value.length <= 13 ? null : "Confira o número do celular com DDD.";
    case "email":
      return /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(value) ? null : "Confira o e-mail.";
    default:
      return null;
  }
};

export interface FormState {
  progress: number;
  missing: string[];
  problems: Record<string, string>;
  ready: boolean;
}

// how far it went: every required field right, both sides of the ID (one PDF counts for both) and the agreement
export const stateOf = (data: Record<string, string>, files: StoredFile[], consent: boolean): FormState => {
  const problems: Record<string, string> = {};
  const missing: string[] = [];
  let done = 0;
  let total = 0;
  for (const f of FIELDS) {
    if (f.optional) continue;
    total += 1;
    const value = data[f.key] || "";
    const problem = problemOf(f.key, value);
    if (problem) problems[f.key] = problem;
    if (value && !problem) done += 1;
    else missing.push(f.label);
  }
  const front = files.find(x => x.kind === "doc_frente");
  const back = files.find(x => x.kind === "doc_verso");
  total += 2;
  if (front) done += 1;
  else missing.push(FILE_KINDS.doc_frente.label);
  if (back || (front && front.mime === "application/pdf")) done += 1;
  else missing.push(FILE_KINDS.doc_verso.label);
  total += 1;
  if (consent) done += 1;
  else missing.push("Autorização de uso dos dados (LGPD)");
  const progress = Math.round((done / total) * 100);
  return { progress, missing, problems, ready: done === total };
};

const linkOf = (form: EnrollmentForm): string => `${frontBase()}/ficha/${form.token}`;

// the lead's form: the open one, else a new one, filled with what the CRM already knows (the person only checks it)
export const formForLead = async (lead: Lead, userId: number | null): Promise<EnrollmentForm> => {
  const current = await EnrollmentForm.findOne({ where: { leadId: lead.id }, order: [["id", "DESC"]] });
  if (current) {
    // an expired link is born again with the same data (the person never loses what was typed)
    if (current.expiresAt && current.expiresAt.getTime() < Date.now() && !lead.enrolledAt) {
      current.set({ token: randomBytes(24).toString("hex"), expiresAt: new Date(Date.now() + VALID_DAYS * 864e5) } as any);
      await current.save();
    }
    return current;
  }
  const contact = lead.contactId ? await Contact.findByPk(lead.contactId, { attributes: ["email", "number"] }) : null;
  const known: Record<string, string> = {
    nome: normalizeField("nome", lead.name),
    cpf: normalizeField("cpf", lead.cpf),
    email: normalizeField("email", lead.email || contact?.email),
    celular: normalizeField("celular", lead.phone || contact?.number),
    cidade: normalizeField("cidade", lead.city),
    uf: UFS.includes(String(lead.state || "").toUpperCase()) ? String(lead.state).toUpperCase() : ""
  };
  Object.keys(known).forEach(k => { if (!known[k]) delete known[k]; });
  const state = stateOf(known, [], false);
  return EnrollmentForm.create({
    leadId: lead.id,
    token: randomBytes(24).toString("hex"),
    data: sealSecret(JSON.stringify(known)),
    files: "[]",
    progress: state.progress,
    expiresAt: new Date(Date.now() + VALID_DAYS * 864e5),
    createdBy: userId
  } as any);
};

// what the team sees (the data in full, the pictures by an authenticated route)
export const staffView = (form: EnrollmentForm | null) => {
  if (!form) return null;
  const data = dataOf(form);
  const files = filesOf(form);
  const state = stateOf(data, files, !!form.consentAt);
  return {
    id: form.id,
    link: linkOf(form),
    progress: state.progress,
    missing: state.missing,
    problems: state.problems,
    data,
    fields: FIELDS,
    files: files.map(f => ({ kind: f.kind, label: FILE_KINDS[f.kind]?.label || f.kind, name: f.name, mime: f.mime, size: f.size, at: f.at })),
    consentAt: form.consentAt,
    submittedAt: form.submittedAt,
    lastSavedAt: form.lastSavedAt,
    sentAt: form.sentAt,
    expiresAt: form.expiresAt
  };
};

// the text sent to the lead with the link (no emoji, one request)
export const linkMessage = (lead: Lead, form: EnrollmentForm): string => {
  const first = String(lead.name || "").trim().split(/\s+/)[0];
  const state = stateOf(dataOf(form), filesOf(form), !!form.consentAt);
  const started = state.progress > 0 && !!form.lastSavedAt;
  return [
    `${first ? `${first}, ` : ""}${started ? `a sua ficha de matrícula está ${state.progress}% preenchida.` : "para seguir com a sua matrícula, preencha a sua ficha pelo link abaixo."}`,
    "",
    linkOf(form),
    "",
    started
      ? "Abra o link para completar o que falta. O que você já preencheu está salvo."
      : "Leva poucos minutos. Tenha em mãos o RG ou a CNH para tirar a foto. Dá para parar e continuar depois: tudo fica salvo."
  ].join("\n");
};

// ---- the public side (the personal link) ----

export const formByToken = async (token: string): Promise<{ form: EnrollmentForm; lead: Lead }> => {
  if (!/^[a-f0-9]{48}$/.test(String(token || ""))) throw new AppError("ERR_FORM_NOT_FOUND", 404);
  const form = await EnrollmentForm.findOne({ where: { token } });
  if (!form) throw new AppError("ERR_FORM_NOT_FOUND", 404);
  if (form.expiresAt && form.expiresAt.getTime() < Date.now()) throw new AppError("ERR_FORM_EXPIRED", 410);
  const lead = await Lead.findByPk(form.leadId);
  if (!lead) throw new AppError("ERR_FORM_NOT_FOUND", 404);
  return { form, lead };
};

export const publicView = async (form: EnrollmentForm, lead: Lead) => {
  const data = dataOf(form);
  const files = filesOf(form);
  const state = stateOf(data, files, !!form.consentAt);
  const course = lead.courseId ? await Course.findByPk(lead.courseId, { attributes: ["name"] }) : null;
  return {
    firstName: String(lead.name || "").trim().split(/\s+/)[0] || "",
    courseName: course?.name || null,
    data,
    files: files.map(f => ({ kind: f.kind, name: f.name, mime: f.mime, size: f.size })),
    fields: FIELDS,
    fileKinds: FILE_KINDS,
    consent: !!form.consentAt,
    consentText: CONSENT_TEXT,
    ...state,
    submittedAt: form.submittedAt,
    // after the enrollment the form only shows what was sent
    locked: !!lead.enrolledAt
  };
};

const assertOpen = (lead: Lead): void => {
  if (lead.enrolledAt) throw new AppError("ERR_FORM_LOCKED", 409);
};

// a change kept at once (only the known fields; a field sent empty is cleared)
export const saveDraft = async (form: EnrollmentForm, lead: Lead, patch: Record<string, unknown>, consent?: boolean) => {
  assertOpen(lead);
  const data = dataOf(form);
  for (const f of FIELDS) {
    if (patch && Object.prototype.hasOwnProperty.call(patch, f.key)) {
      const value = normalizeField(f.key, patch[f.key]);
      if (value) data[f.key] = value;
      else delete data[f.key];
    }
  }
  const files = filesOf(form);
  const consentAt = consent === undefined ? form.consentAt : consent ? form.consentAt || new Date() : null;
  const state = stateOf(data, files, !!consentAt);
  form.set({ data: sealSecret(JSON.stringify(data)), progress: state.progress, consentAt, lastSavedAt: new Date() } as any);
  await form.save();
  return publicView(form, lead);
};

// the first bytes say what a file really is (the name and the type the phone gives are not trusted)
const sniff = (bytes: Buffer): string | null => {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (bytes.subarray(0, 4).toString("latin1") === "RIFF" && bytes.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  if (bytes.subarray(0, 5).toString("latin1") === "%PDF-") return "application/pdf";
  if (bytes.subarray(4, 8).toString("latin1") === "ftyp" && /^(heic|heix|hevc|mif1|msf1|heif)/.test(bytes.subarray(8, 12).toString("latin1"))) return "image/heic";
  return null;
};
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf", "image/heic": "heic" };

const removeStored = (file: string): void => {
  if (!/^[a-f0-9]{36}\.bin$/.test(file)) return;
  try {
    fs.rmSync(path.join(DIR(), file), { force: true });
  } catch (err) {
    logger.warn(`Arquivo da ficha não apagado: ${(err as Error).message}`);
  }
};

export const saveFile = async (form: EnrollmentForm, lead: Lead, kind: string, bytes: Buffer, originalName: string) => {
  assertOpen(lead);
  if (!FILE_KINDS[kind]) throw new AppError("ERR_FORM_FILE_KIND", 400);
  if (!bytes || !bytes.length) throw new AppError("ERR_FORM_FILE_EMPTY", 400);
  if (bytes.length > MAX_FILE) throw new AppError("ERR_FORM_FILE_TOO_BIG", 413);
  const mime = sniff(bytes);
  if (!mime) throw new AppError("ERR_FORM_FILE_TYPE", 415);
  fs.mkdirSync(DIR(), { recursive: true, mode: 0o700 });
  const file = `${randomBytes(18).toString("hex")}.bin`;
  fs.writeFileSync(path.join(DIR(), file), sealBytes(bytes), { mode: 0o600 });
  const files = filesOf(form);
  const old = files.find(f => f.kind === kind);
  if (old) removeStored(old.file);
  const name = `${FILE_KINDS[kind].label.replace(/[^\p{L}\p{N} ()-]/gu, "")}.${EXT[mime]}`;
  const next = [...files.filter(f => f.kind !== kind), { kind, file, name, mime, size: bytes.length, at: new Date().toISOString() }];
  const state = stateOf(dataOf(form), next, !!form.consentAt);
  form.set({ files: JSON.stringify(next), progress: state.progress, lastSavedAt: new Date() } as any);
  await form.save();
  return publicView(form, lead);
};

export const removeFile = async (form: EnrollmentForm, lead: Lead, kind: string) => {
  assertOpen(lead);
  const files = filesOf(form);
  const old = files.find(f => f.kind === kind);
  if (old) removeStored(old.file);
  const next = files.filter(f => f.kind !== kind);
  const state = stateOf(dataOf(form), next, !!form.consentAt);
  form.set({ files: JSON.stringify(next), progress: state.progress, lastSavedAt: new Date() } as any);
  await form.save();
  return publicView(form, lead);
};

// the picture, opened for the team (never by the public link)
export const readFile = (form: EnrollmentForm, kind: string): { bytes: Buffer; mime: string; name: string } => {
  const f = filesOf(form).find(x => x.kind === kind);
  if (!f || !/^[a-f0-9]{36}\.bin$/.test(f.file)) throw new AppError("ERR_NOT_FOUND", 404);
  const full = path.join(DIR(), f.file);
  if (!fs.existsSync(full)) throw new AppError("ERR_NOT_FOUND", 404);
  return { bytes: openBytes(fs.readFileSync(full)), mime: f.mime, name: f.name };
};

const markDelivered = async (lead: Lead, names: string[]): Promise<void> => {
  await ensureDocuments(lead.id);
  const docs = await LeadDocument.findAll({ where: { leadId: lead.id } });
  for (const name of names) {
    const doc = docs.find(d => d.name.toLowerCase() === name.toLowerCase());
    if (!doc || doc.status !== "pending") continue;
    // eslint-disable-next-line no-await-in-loop
    await setDocumentStatus(lead, doc.id, "received", null as any, "Enviado pela ficha de matrícula").catch(err => logger.warn(`Documento ${name} não marcado: ${err.message}`));
  }
};

// sent: the lead's record takes what was typed, the documents count as delivered and the consultant is told
export const submitForm = async (form: EnrollmentForm, lead: Lead) => {
  assertOpen(lead);
  const data = dataOf(form);
  const files = filesOf(form);
  const state = stateOf(data, files, !!form.consentAt);
  if (!state.ready) throw new AppError("ERR_FORM_INCOMPLETE", 400);
  const first = !form.submittedAt;
  form.set({ submittedAt: new Date() } as any);
  await form.save();

  const patch: Record<string, unknown> = { name: data.nome, email: data.email };
  // one CPF belongs to one lead: the same person with two leads keeps the CPF on the first, and the consultant is told
  const twin = await Lead.findOne({ where: { cpf: data.cpf, id: { [Op.ne]: lead.id } } as any, attributes: ["id", "name"] });
  if (twin) await addActivity(lead.id, null, "system", `O CPF da ficha já está no lead nº ${twin.id} (${twin.name}). Confira se é a mesma pessoa.`);
  else patch.cpf = data.cpf;
  if (data.cidade) patch.city = data.cidade;
  if (data.uf) patch.state = data.uf;
  lead.set(patch as any);
  await lead.save();
  if (lead.contactId) {
    const contact = await Contact.findByPk(lead.contactId);
    if (contact && !contact.email) {
      contact.set({ email: data.email } as any);
      await contact.save();
    }
  }
  await markDelivered(lead, ["RG ou CNH", "CPF", ...(files.some(f => f.kind === "historico") ? ["Histórico escolar"] : [])]);
  await addActivity(lead.id, null, "system", first ? "O lead enviou a ficha de matrícula (dados e documento)." : "O lead atualizou a ficha de matrícula.");
  await notify([lead.ownerId], {
    kind: "enrollment_form",
    title: `${String(lead.name || "Um lead").split(" ")[0]} enviou a ficha de matrícula`,
    body: "Os dados e o documento estão na ficha do lead.",
    link: `/crm?lead=${lead.id}`,
    dedupeKey: `enrollment_form:${form.id}:${first ? "first" : form.submittedAt.toISOString()}`
  });
  getIO().emit("lead", { action: "update", lead: await loadLead(lead.id) });
  return publicView(form, lead);
};

// erasing on request of the person (LGPD): the data and the pictures go, the row stays saying when it was erased
export const eraseForm = async (form: EnrollmentForm, userId: number): Promise<void> => {
  filesOf(form).forEach(f => removeStored(f.file));
  form.set({ data: sealSecret("{}"), files: "[]", progress: 0, consentAt: null, submittedAt: null, expiresAt: new Date() } as any);
  await form.save();
  await addActivity(form.leadId, userId, "system", "Dados da ficha de matrícula apagados a pedido do titular (LGPD).");
};

// the e-mail the student typed, for the portal and the lead at the enrollment
export const formEmailOf = async (leadId: number): Promise<string | null> => {
  const form = await EnrollmentForm.findOne({ where: { leadId }, order: [["id", "DESC"]] });
  if (!form || !form.submittedAt) return null;
  const email = dataOf(form).email;
  return email && !problemOf("email", email) ? email : null;
};
