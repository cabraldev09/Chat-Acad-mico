import { createHash } from "crypto";

import {
  DEFAULT_RULES,
  buildProjectionNarrative,
  calculateAnalysisStatus,
  calculateCurriculumTotals,
  calculatePreviousBacklog,
  compareDocumentClaims,
  detectInconsistencies,
  ENGINE_VERSION,
  isValidTerm,
  simulateCurriculum,
  validateAnalysis,
  type AcademicRules,
  type AnalysisWarningInput,
  type CurriculumTotals,
  type DocumentClaimInput,
  type ProjectionNarrative,
  type ReliabilityLevel,
  type SimulationResult,
  type SubjectRow
} from "./domain/curricular-analysis";
import { analyzeAcademicGrid, buildStudentMessage } from "./domain/academic-analysis/analyze";
import { estimateGraduation, type GraduationForecast } from "./domain/academic-analysis/graduation-forecast";
import type { AcademicGridSnapshot, EnrollmentSituation } from "./domain/academic-analysis/types";
import { enrollmentBlocks, enrollmentMessage, enrollmentWarning } from "./domain/academic-analysis/enrollment";
import { DEFAULT_ACADEMIC_CALENDAR, buildAcademicCalendar } from "./domain/academic-calendar/calendar";
import { zonedDateParts } from "./lib/time";
import { extractAcademicDocument } from "./services/academic-documents/adapters";
import { autoMapHistorySnapshot } from "./services/academic-analysis/history-mapping";
import { classifyAcademicDocument, type AcademicDocumentType } from "./services/academic-documents/classifier";
import { normalizeExtraction } from "./services/pipeline/normalize";
import { readHeaderMetadata } from "./services/pipeline/cross-check";
import { parsePdf, type LocalExtraction } from "./services/pdf/parser";
import { effectiveRows } from "./services/pdf/table-detector";
import { VisionFailure, noTextLayer, readWithVision } from "./services/pdf/vision";
import type { CurriculumExtraction } from "./services/openai/schemas";

// Everything here is local and deterministic: the PDF is read with pdf.js, the numbers come from the academic engine.
// (The original system also had an AI step to read unusual tables and to audit; it is off here.)

export class AnalysisError extends Error {}

export const sha256 = (bytes: Buffer | string): string => createHash("sha256").update(bytes).digest("hex");

export const MAX_PDF_PAGES = 40;
export const MAX_PDF_BYTES = 15 * 1024 * 1024;

// ------------------------------------------------------------------ curricular analysis (entry forecast)

export interface StoredSubject extends SubjectRow {
  code: string | null;
  bbox?: unknown;
  note?: string | null;
}

export interface CurricularRead {
  courseName: string | null;
  matrixLabel: string | null;
  campus: string | null;
  modality: string | null;
  headerEntryPeriod: number | null;
  subjects: StoredSubject[];
  claims: DocumentClaimInput[];
  warnings: AnalysisWarningInput[];
  pageCount: number;
}

// the table rebuilt from the positions of the text (SIAA printout and unified enrollment result)
const extractionFromTable = (local: LocalExtraction): CurriculumExtraction | null => {
  const rows = local.table ? effectiveRows(local.table) : [];
  if (rows.length === 0) return null;
  const header = readHeaderMetadata(local);
  const claims: CurriculumExtraction["documentClaims"] = [];
  const addClaim = (type: CurriculumExtraction["documentClaims"][number]["type"], value: number, rawText: string, page: number) => {
    if (!claims.some(c => c.type === type && c.value === value)) claims.push({ type, value, sourcePage: page, rawText });
  };
  for (const [page, lines] of Object.entries(local.table?.freeText ?? {})) {
    for (const line of lines) {
      const pending = line.match(/(\d+)\s+disciplinas?\s+para\s+(?:adaptar|cursar)/i) ?? line.match(/total\s+de\s+disciplinas\s+a\s+cursar:\s*(\d+)/i);
      if (pending) addClaim("PENDING_TOTAL", Number(pending[1]), line, Number(page));
      const exempted = line.match(/total\s+de\s+disciplinas\s+dispensadas:\s*(\d+)/i);
      if (exempted) addClaim("EXEMPTED_TOTAL", Number(exempted[1]), line, Number(page));
    }
  }
  return {
    document: {
      course: header.course,
      matrix: header.matrix,
      campus: header.campus,
      modality: header.modality,
      candidateLabel: null,
      detectedEntryPeriod: header.entryPeriod,
      detectedEntryPeriodEvidence: header.entryPeriod === null ? null : `Cabeçalho do documento: período de ingresso ${header.entryPeriod}`
    },
    subjects: rows.map(r => ({
      code: r.code,
      name: r.name,
      workload: r.workload ?? 0,
      period: r.period ?? 0,
      usedSubject: r.usedSubject,
      sourcePage: r.page,
      sourceRow: r.rowIndex,
      readability: "CLEAR" as const,
      note: null
    })),
    documentClaims: claims,
    ambiguities: []
  };
};

export const readCurricularPdf = async (bytes: Buffer): Promise<CurricularRead> => {
  let local: LocalExtraction;
  try {
    local = await parsePdf(bytes, { maxPages: MAX_PDF_PAGES });
  } catch (err) {
    throw new AnalysisError("Não foi possível ler o conteúdo do PDF. Envie o arquivo original, com texto selecionável.");
  }
  if (local.pageCount > MAX_PDF_PAGES) throw new AnalysisError(`O PDF tem páginas demais (limite de ${MAX_PDF_PAGES}).`);
  let data = extractionFromTable(local);
  // a printout with no text at all (the letters are drawn as shapes): the model reads the pages, and the result goes through the same checks
  if (!data && noTextLayer(local)) {
    let seen: LocalExtraction | null = null;
    try {
      seen = await readWithVision(bytes, local.pageCount);
    } catch (err) {
      if (err instanceof VisionFailure) throw new AnalysisError(`Este PDF não tem texto selecionável e não consegui lê-lo: ${err.message}.`);
      throw err;
    }
    if (seen) {
      local = seen;
      data = extractionFromTable(local);
    }
  }
  if (!data) {
    throw new AnalysisError(
      noTextLayer(local)
        ? "Este PDF não tem texto selecionável (as letras foram salvas como imagem) e não consegui lê-lo. Gere o PDF de novo pela impressão da página ou envie o arquivo original."
        : "Não consegui identificar a tabela de disciplinas neste PDF. Envie a análise curricular do SIAA (colunas Disciplina, C.H., Série e Disciplina utilizada)."
    );
  }
  const documentId = sha256(bytes).slice(0, 24);
  const normalized = normalizeExtraction(data, documentId, local);
  const subjects: StoredSubject[] = normalized.map(n => ({
    id: n.rowHash,
    code: n.code,
    name: n.name,
    workload: n.workload,
    period: n.period,
    usedSubject: n.usedSubject,
    status: n.status,
    readability: n.readability,
    sourcePage: n.sourcePage,
    sourceRow: n.sourceRow,
    sortIndex: n.sortIndex,
    bbox: n.bbox,
    note: n.note
  }));
  const warnings: AnalysisWarningInput[] = [];
  if (subjects.some(s => !s.period)) {
    warnings.push({ code: "SUBJECT_WITHOUT_PERIOD", severity: "CRITICAL", source: "PIPELINE", message: "Há disciplina sem período (série) legível no PDF. Confira o documento." });
  }
  return {
    courseName: data.document.course,
    matrixLabel: data.document.matrix,
    campus: data.document.campus,
    modality: data.document.modality,
    headerEntryPeriod: data.document.detectedEntryPeriod,
    subjects,
    claims: data.documentClaims.map(c => ({ type: c.type, value: c.value, sourcePage: c.sourcePage, rawText: c.rawText })),
    warnings,
    pageCount: local.pageCount
  };
};

export interface CurricularResult {
  engineVersion: string;
  entryPeriod: number | null;
  startTerm: string;
  totals: CurriculumTotals;
  simulation: SimulationResult | null;
  narrative: ProjectionNarrative | null;
  warnings: AnalysisWarningInput[];
  claims: Array<DocumentClaimInput & { calculatedValue: number | null; matches: boolean | null }>;
  reliability: ReliabilityLevel;
  reviewReasons: string[];
  reviewItemsCount: number;
  previousBacklogCount: number | null;
  backlogTotal: number;
}

// the first term the team projects from while nothing else is typed (changed here when the semester moves)
export const DEFAULT_START_TERM = "2026.2";
export const defaultStartTerm = (): string => DEFAULT_START_TERM;

// The same chain of the original pipeline after the extraction: totals, inconsistencies, simulation, claims, invariants
export const computeCurricular = (input: {
  subjects: SubjectRow[];
  claims: DocumentClaimInput[];
  entryPeriod: number | null;
  startTerm: string;
  rules?: AcademicRules;
  baseWarnings?: AnalysisWarningInput[];
}): CurricularResult => {
  const rules = input.rules ?? DEFAULT_RULES;
  if (!isValidTerm(input.startTerm)) throw new AnalysisError("Semestre letivo inválido. Use o formato 2026.2.");
  const { subjects, entryPeriod } = input;
  const totals = calculateCurriculumTotals(subjects);
  const warnings: AnalysisWarningInput[] = [...(input.baseWarnings || []), ...detectInconsistencies(subjects, totals)];

  let simulation: SimulationResult | null = null;
  let previousBacklogCount: number | null = null;
  let narrative: ProjectionNarrative | null = null;
  let backlogTotal = 0;
  if (entryPeriod !== null) {
    const backlog = calculatePreviousBacklog(subjects, entryPeriod, rules);
    previousBacklogCount = backlog.length;
    backlogTotal = backlog.length;
    simulation = simulateCurriculum({ subjects, entryPeriod, startTerm: input.startTerm, rules });
    if (simulation.incomplete) {
      warnings.push({
        code: simulation.incompleteReason === "MAX_ADDITIONAL_SEMESTERS" ? "MAX_ADDITIONAL_SEMESTERS_REACHED" : "ADDITIONAL_SEMESTER_RULE_UNCONFIGURED",
        severity: "CRITICAL",
        source: "PIPELINE",
        message: simulation.incompleteReason === "MAX_ADDITIONAL_SEMESTERS" ? "O limite de semestres adicionais foi atingido sem zerar as pendências." : "Ainda restam pendências após o último período e a regra de semestre adicional não está configurada."
      });
    }
    const periods = backlog.map(s => s.period);
    narrative = buildProjectionNarrative({
      semesters: simulation.semesters,
      entryPeriod,
      backlogTotal: backlog.length,
      backlogPeriodRange: periods.length ? { from: Math.min(...periods), to: Math.max(...periods) } : null,
      maximumCapacity: simulation.semesters.length ? Math.max(...simulation.semesters.map(s => s.maximumCapacity)) : 0,
      incomplete: simulation.incomplete,
      remainingBacklog: simulation.remainingBacklogIds.length,
      periodUnit: rules.periodUnit,
      calendarTerms: buildAcademicCalendar(DEFAULT_ACADEMIC_CALENDAR, zonedDateParts().year + 8)
    });
  } else {
    warnings.push({ code: "ENTRY_PERIOD_REQUIRED", severity: "CRITICAL", source: "PIPELINE", message: "Informe o período de ingresso do candidato para calcular a previsão." });
  }

  const claimResult = compareDocumentClaims(input.claims, totals, { entryPeriod, previousBacklogCount });
  warnings.push(...claimResult.warnings);
  const violations = validateAnalysis({ extractedCount: subjects.length, subjects, totals, simulation });
  for (const v of violations) warnings.push({ code: `INVARIANT_${v.code}`, severity: "CRITICAL", source: "VALIDATOR", message: v.message, subjectId: v.subjectId ?? null });

  const status = calculateAnalysisStatus({
    subjects,
    warnings: warnings.filter(w => !w.code.startsWith("INVARIANT_") && w.code !== "ENTRY_PERIOD_REQUIRED" && !w.code.includes("ADDITIONAL_SEMESTER")),
    violations: warnings.filter(w => w.code.startsWith("INVARIANT_")).map(w => ({ code: "TOTALS_DO_NOT_ADD_UP" as const, message: w.message })),
    entryPeriodConfirmed: entryPeriod !== null,
    simulationIncomplete: simulation?.incomplete ?? false,
    auditorStatus: null,
    auditorCriticalIssues: 0,
    auditorMinorIssues: 0
  });
  return {
    engineVersion: ENGINE_VERSION,
    entryPeriod,
    startTerm: input.startTerm,
    totals,
    simulation,
    narrative,
    warnings,
    claims: claimResult.comparisons.map(c => ({ ...c.claim, calculatedValue: c.calculatedValue, matches: c.matches })),
    reliability: status.reliability,
    reviewReasons: status.reasons,
    reviewItemsCount: status.reviewItemsCount,
    previousBacklogCount,
    backlogTotal
  };
};

// ------------------------------------------------------------------ academic analysis (graduation forecast)

export interface AcademicEvaluation {
  snapshot: AcademicGridSnapshot;
  forecast: GraduationForecast | null;
  message: string;
}

const todayIso = (): string => {
  const p = zonedDateParts();
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
};

// the grid result + the graduation forecast + the text for the student, always recomputed from the disciplines
export const evaluateAcademic = (snapshotIn: AcademicGridSnapshot, opts: { currentPeriod?: number | null; rules?: AcademicRules; enrollment?: EnrollmentSituation | null } = {}): AcademicEvaluation => {
  const snapshot: AcademicGridSnapshot = { ...snapshotIn };
  if (opts.enrollment !== undefined) snapshot.enrollmentSituation = opts.enrollment;
  const period = opts.currentPeriod === undefined ? snapshot.result.currentPeriod : opts.currentPeriod;
  const confirmed = period !== null && (opts.currentPeriod === undefined ? snapshot.result.currentPeriodConfirmed : true);
  const rules = opts.rules ?? snapshot.projectionRules ?? DEFAULT_RULES;
  snapshot.projectionRules = rules;
  snapshot.result = analyzeAcademicGrid({ disciplines: snapshot.disciplines, currentPeriod: period, currentPeriodConfirmed: confirmed });
  snapshot.mappingRequired = snapshot.disciplines.some(d => d.inMainCurriculum && d.sourcePage > 0 && d.period === null) || period === null;
  const forecast =
    confirmed && snapshot.result.status !== "MANUAL_REVIEW_REQUIRED"
      ? estimateGraduation({
          disciplines: snapshot.disciplines,
          currentPeriod: period,
          analysisDate: todayIso(),
          calendarTerms: buildAcademicCalendar(DEFAULT_ACADEMIC_CALENDAR, zonedDateParts().year + 10),
          rules,
          extractionWarnings: snapshot.extractionWarnings,
          sourceDisciplineCount: snapshot.sourceDisciplineCount,
          sourceParsedDisciplineCount: snapshot.sourceParsedDisciplineCount
        })
      : null;
  // an enrollment that is not active cannot add subjects nor graduate: say so, instead of a forecast that does not hold
  const situation = snapshot.enrollmentSituation;
  if (enrollmentBlocks(situation)) {
    snapshot.result = { ...snapshot.result, status: "ENROLLMENT_INACTIVE", canAddNow: 0, warnings: [enrollmentWarning(situation!), ...snapshot.result.warnings] };
    return { snapshot, forecast: null, message: enrollmentMessage(situation!) };
  }
  // a forecast with doubts is shown as a draft: the text for the student does not announce a date
  const publishable = forecast && !forecast.incomplete && forecast.uncertainRows === 0 ? forecast : null;
  return { snapshot, forecast, message: buildStudentMessage({ result: snapshot.result, forecast: publishable }) };
};

export interface AcademicRead {
  documentType: AcademicDocumentType;
  snapshot: AcademicGridSnapshot;
  contentFingerprintSource: string;
  pageCount: number;
}

// Reads an extract or a history (official or simple). Throws AnalysisError with a message for the person.
export const readAcademicPdf = async (bytes: Buffer, filename: string, previous?: AcademicGridSnapshot | null): Promise<AcademicRead> => {
  let local: LocalExtraction;
  try {
    local = await parsePdf(bytes, { maxPages: MAX_PDF_PAGES });
  } catch (err) {
    throw new AnalysisError("Não foi possível ler o PDF. Verifique se ele está íntegro e tem texto selecionável.");
  }
  if (local.pageCount > MAX_PDF_PAGES) throw new AnalysisError(`O PDF tem páginas demais (limite de ${MAX_PDF_PAGES}).`);
  const documentType = classifyAcademicDocument(local);
  let snapshot: AcademicGridSnapshot;
  try {
    snapshot = extractAcademicDocument(local, filename, previous ?? undefined);
  } catch (err) {
    throw new AnalysisError((err as Error).message || "Não foi possível identificar este documento.");
  }
  snapshot = autoMapHistorySnapshot(snapshot).snapshot;
  return { documentType, snapshot, contentFingerprintSource: local.textByPage.join("\n"), pageCount: local.pageCount };
};
