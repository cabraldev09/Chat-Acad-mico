import { parsePdf, type ParsedPage } from "../pdf/parser";
import { logger } from "../../lib/logger";
import { normalizeCatalogMetadata, type CommercialTrack } from "./course-metadata";
import { readMatrixLayout, type MatrixLayoutReading } from "./matrix-layout";

// Reading of a commercial matrix ("grade comercial"): the PDF of the SIAA curricular matrix of a course becomes the
// facts the commercial team needs (duration, hours, internships, TCC) and a text ready for WhatsApp.
// Brought from the original system; here the reading is always local (columns of the PDF), no AI.

export interface CommercialGradeReading {
  courseName: string | null;
  modality: string | null;
  curriculumTerm: string | null;
  hasTcc: boolean;
  totalInternshipHours: number | null;
  totalCourseHours: number | null;
  degree: string | null;
  knowledgeArea: string | null;
  durationSemesters: number | null;
  courseTracks: CommercialTrack[];
  internshipInfo: string | null;
  whatsappSummary: string;
  source: "LOCAL";
  /** only for lato sensu courses */
  durationMonths?: number | null;
  /** false when the PDF did not bring the course, the total hours or the duration (the team must check). */
  complete?: boolean;
}

export async function readCommercialGrade(bytes: Buffer, filename: string): Promise<CommercialGradeReading> {
  let text = "";
  let pages: ParsedPage[] | undefined;
  try {
    const local = await parsePdf(bytes, { maxPages: 80 });
    text = local.textByPage.join("\n");
    pages = local.pages;
  } catch (error) {
    logger.warn("commercial_grade.local_read_failed", { filename, error: String(error) });
  }
  const layout = readMatrixLayout(pages);
  const fromPdf = layout ? layoutReading(layout, filename) : null;
  const reading = fromPdf && layout && layoutComplete(layout) ? fromPdf : fromPdf ? mergeReadings(fromPdf, localReading(text, filename)) : localReading(text, filename);
  // lato sensu courses ("Pós EAD"): the minimum term is in months, not in semesters
  const postgraduate = /P[ÓO]S\s+EAD|P[ÓO]S-GRADUA/i.test(text) ? { months: Number(text.match(/Prazo\s+M[ií]n\.?\s*(\d{1,2})/i)?.[1]) || null } : null;
  const finished = postgraduate ? { ...reading, modality: reading.modality ?? "EAD", degree: "Pós-graduação", knowledgeArea: reading.knowledgeArea, durationSemesters: null, durationMonths: postgraduate.months } : reading;
  const complete = Boolean(finished.courseName && finished.totalCourseHours !== null && (finished.durationSemesters !== null || postgraduate?.months));
  return { ...sanitizeReading(finished), complete };
}

/** Course, total hours and duration: with them the SIAA matrix is fully read. */
function layoutComplete(layout: MatrixLayoutReading): boolean {
  return Boolean(layout.courseName && layout.totalCourseHours !== null && layout.durationSemesters !== null && layout.componentCount > 0);
}

/** Partial layout: what came from the SIAA columns prevails; the labels of the running text complete the rest. */
function mergeReadings(layout: CommercialGradeReading, text: CommercialGradeReading): CommercialGradeReading {
  const courseName = layout.courseName ?? text.courseName;
  const internshipInfo = layout.internshipInfo ?? text.internshipInfo;
  const totalInternshipHours = layout.totalInternshipHours ?? text.totalInternshipHours;
  const totalCourseHours = layout.totalCourseHours ?? text.totalCourseHours;
  const hasTcc = layout.hasTcc || text.hasTcc;
  const metadata = normalizeCatalogMetadata({ courseName, durationSemesters: layout.durationSemesters ?? text.durationSemesters });
  return { ...layout, courseName, modality: layout.modality ?? text.modality, curriculumTerm: layout.curriculumTerm ?? text.curriculumTerm, hasTcc, totalInternshipHours, totalCourseHours, degree: metadata.degree, knowledgeArea: metadata.knowledgeArea, durationSemesters: metadata.durationSemesters, internshipInfo, whatsappSummary: whatsappText({ courseName, hasTcc, totalInternshipHours, totalCourseHours, internshipInfo, certain: false }) };
}

function layoutReading(layout: MatrixLayoutReading, filename: string): CommercialGradeReading {
  const courseName = layout.courseName ?? filename.replace(/\.pdf$/i, "").trim();
  const internshipInfo = layout.internships.length ? layout.internships.map(item => `- ${item.semester}º sem.: ${item.name}${item.workload ? ` (${item.workload}h)` : ""}`).join("\n") : null;
  const metadata = normalizeCatalogMetadata({ courseName, durationSemesters: layout.durationSemesters });
  const reading = { courseName, modality: layout.modality, curriculumTerm: layout.curriculumTerm, hasTcc: layout.hasTcc, totalInternshipHours: layout.totalInternshipHours, totalCourseHours: layout.totalCourseHours, degree: metadata.degree, knowledgeArea: metadata.knowledgeArea, durationSemesters: metadata.durationSemesters, courseTracks: layout.tracks, internshipInfo };
  return { ...reading, whatsappSummary: whatsappText({ ...reading, certain: false }), source: "LOCAL" };
}

/** Largest value accepted in integer columns (INT4 of PostgreSQL) with room for real hours/semesters. */
const MAX_REASONABLE_INT = 100_000;

/** Removes control characters (NUL included, which PostgreSQL rejects) and repeated spaces; empty becomes null. */
export function cleanReadingText(value: string | null | undefined, maxLength = 4_000): string | null {
  // eslint-disable-next-line no-control-regex
  const cleaned = (value ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").replace(/[ \t]+\n/g, "\n").trim();
  return cleaned ? cleaned.slice(0, maxLength) : null;
}

/** Positive, plausible integer; anything else (NaN, decimal, overflow) becomes null. */
export function safeReadingInt(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= MAX_REASONABLE_INT ? value : null;
}

function cleanDeep<T>(value: T): T {
  if (typeof value === "string") return (cleanReadingText(value) ?? "") as T;
  if (Array.isArray(value)) return value.map(cleanDeep) as T;
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cleanDeep(item)])) as T;
  if (typeof value === "number") return (safeReadingInt(value) ?? null) as T;
  return value;
}

/** Makes sure no value read from the PDF can stop the record from being saved. */
export function sanitizeReading(reading: CommercialGradeReading): CommercialGradeReading {
  const clean = {
    ...reading,
    courseName: cleanReadingText(reading.courseName, 180),
    modality: cleanReadingText(reading.modality, 80),
    curriculumTerm: cleanReadingText(reading.curriculumTerm, 40),
    degree: cleanReadingText(reading.degree, 80),
    knowledgeArea: cleanReadingText(reading.knowledgeArea, 80),
    durationSemesters: safeReadingInt(reading.durationSemesters),
    totalInternshipHours: safeReadingInt(reading.totalInternshipHours),
    totalCourseHours: safeReadingInt(reading.totalCourseHours),
    internshipInfo: cleanReadingText(reading.internshipInfo),
    courseTracks: cleanDeep(reading.courseTracks)
  };
  // The summary is rebuilt only with the validated values: a discarded total never comes back in the text.
  return { ...clean, whatsappSummary: whatsappText({ ...clean, durationMonths: safeReadingInt(reading.durationMonths ?? null), certain: false }) };
}

function localReading(text: string, filename: string): CommercialGradeReading {
  const courseName = text.match(/Matriz Curricular\s*-\s*\d+\s*-\s*([^\n]+)/i)?.[1]?.replace(/[-–]\s*$/g, "").trim() ?? filename.replace(/\.pdf$/i, "").trim();
  const totalInternshipHours = numberAfter(text, /Total de horas de Est[aá]gio/i, 5_000);
  const totalCourseHours = numberAfter(text, /Total em Horas Rel[oó]gio/i, 20_000);
  const hasTcc = /\bTCC\b|TRABALHO DE CURSO|TRABALHO DE CONCLUSÃO/i.test(text);
  const internshipInfo = localInternships(text);
  const metadata = normalizeCatalogMetadata({ courseName, durationSemesters: largestSemester(text) });
  return { courseName, modality: /GRADUAÇÃO\s+EAD/i.test(text) ? "EAD" : null, curriculumTerm: text.match(/(20\d{2}\s*\/\s*[12])/i)?.[1] ?? text.match(/\b(20\d{2}\.[12])\b/)?.[1] ?? null, hasTcc, totalInternshipHours, totalCourseHours, degree: metadata.degree, knowledgeArea: metadata.knowledgeArea, durationSemesters: metadata.durationSemesters, courseTracks: [], internshipInfo, whatsappSummary: whatsappText({ courseName, hasTcc, totalInternshipHours, totalCourseHours, internshipInfo, certain: false }), source: "LOCAL" };
}

function localInternships(text: string): string | null {
  const pages = text.split(/(?=\n(?:[1-9]|1\d)\tDescrição)/);
  const rows: Array<{ semester: number; name: string }> = [];
  for (const page of pages) {
    const semester = Number(page.match(/\n(\d{1,2})\tDescrição/)?.[1]);
    if (!semester) continue;
    const normalized = page.replace(/\s+/g, " ");
    const matches = normalized.matchAll(/(EST[ÁA]GIO(?:\s+CURRICULAR)?\s+SUPERVISIONADO\s+EM\s+[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ ]+?(?:\s+[IVX]+)?)(?=PLANO DE|PR[ÁA]TICAS|AVALIAÇÃO|ATIVIDADES|\d{4,}|$)/gi);
    for (const match of matches) rows.push({ semester, name: match[1].replace(/\s+/g, " ").trim() });
  }
  const unique = rows.filter((row, index) => rows.findIndex(other => other.semester === row.semester && other.name === row.name) === index);
  return unique.length ? unique.map(item => `- ${item.semester}º sem.: ${titleCase(item.name)}`).join("\n") : null;
}

/**
 * Number right after the label, in Brazilian format (2.880 / 2880 / 2.880,00). If the text glued to the label is not
 * a plausible number (e.g. table columns stuck together) it returns null instead of inventing a value.
 */
function numberAfter(text: string, label: RegExp, max: number): number | null {
  const found = text.match(new RegExp(`${label.source}[\\s:.-]*((?:\\d{1,3}(?:\\.\\d{3})+|\\d+)(?:,\\d{1,2})?)(?![\\d.,])`, "i"))?.[1];
  if (!found) return null;
  const value = Math.round(Number(found.replace(/\./g, "").replace(",", ".")));
  return Number.isFinite(value) && value >= 0 && value <= max ? value : null;
}

function largestSemester(text: string): number | null {
  const values = [...text.matchAll(/(?:^|\n)(\d{1,2})\s*\t\s*Descrição/gm)].map(match => Number(match[1])).filter(value => value > 0 && value < 30);
  return values.length ? Math.max(...values) : null;
}

function titleCase(value: string): string {
  return value.toLocaleLowerCase("pt-BR").replace(/\b\p{L}/gu, char => char.toLocaleUpperCase("pt-BR"));
}

/** `certain`: the whole course was read. Without it, only an internship total declared as 0 in the PDF allows saying there is none. */
function whatsappText(input: { courseName: string | null; hasTcc: boolean; totalInternshipHours: number | null; totalCourseHours: number | null; internshipInfo: string | null; certain: boolean; durationMonths?: number | null }): string {
  const lines = [`Matriz curricular: ${input.courseName ?? "curso selecionado"}.`];
  if (input.durationMonths) lines.push(`Duração mínima: ${input.durationMonths} meses.`);
  if (input.internshipInfo) {
    lines.push("", "Estágios previstos:", input.internshipInfo);
    if (input.totalInternshipHours) lines.push("", `Ao todo, a matriz prevê ${input.totalInternshipHours.toLocaleString("pt-BR")} horas de estágio durante o curso.`);
  } else if (input.certain || input.totalInternshipHours === 0) {
    lines.push("", "Uma praticidade deste curso: ele não possui estágio obrigatório, trazendo mais flexibilidade para organizar a rotina de estudos.");
  }
  if (input.hasTcc) lines.push("A matriz também prevê TCC / Trabalho de Curso.");
  if (input.totalCourseHours) lines.push(`Carga horária total: ${input.totalCourseHours.toLocaleString("pt-BR")} horas.`);
  return lines.join("\n");
}
