/**
 * Tipos do domínio de análise curricular. Puro: sem Prisma, React ou OpenAI.
 */

export type SubjectStatus = "EXEMPTED" | "PENDING" | "REVIEW";
export type Readability = "CLEAR" | "UNCLEAR" | "UNREADABLE";

export interface SubjectRow {
  /** Identificador estável da linha (hash de documento+página+linha+nome+período). */
  id: string;
  name: string;
  workload: number;
  period: number;
  usedSubject: string | null;
  status: SubjectStatus;
  readability: Readability;
  sourcePage: number;
  sourceRow: number;
  /** Ordem original no documento. */
  sortIndex: number;
}

export interface CurriculumTotals {
  total: number;
  exempted: number;
  pending: number;
  review: number;
  periods: number[];
  byPeriod: Record<number, { total: number; exempted: number; pending: number; review: number }>;
}

export interface SemesterSimulation {
  index: number;
  term: string;
  periodNumber: number | null;
  isAdditional: boolean;
  subjectsInPeriod: number;
  exemptedInPeriod: number;
  regularSubjectsToTake: number;
  maximumCapacity: number;
  backlogCapacity: number;
  subjectsFromBacklog: number;
  semesterLoad: number;
  remainingBacklog: number;
  regularSubjectIds: string[];
  /** Cursos de períodos anteriores já matriculados neste semestre. */
  alreadyInProgressSubjectIds?: string[];
  backlogSubjectIds: string[];
}

export interface SimulationResult {
  semesters: SemesterSimulation[];
  initialBacklogIds: string[];
  remainingBacklogIds: string[];
  /** true quando a simulação parou sem zerar o backlog (regra adicional não configurada ou limite). */
  incomplete: boolean;
  incompleteReason: "ADDITIONAL_SEMESTER_RULE_UNCONFIGURED" | "MAX_ADDITIONAL_SEMESTERS" | null;
  estimatedCompletionTerm: string | null;
  semestersRemaining: number;
}

export interface DocumentClaimInput {
  id?: string;
  type: "PENDING_TOTAL" | "EXEMPTED_TOTAL" | "TOTAL_SUBJECTS" | "ENTRY_PERIOD" | "OTHER";
  value: number | null;
  sourcePage: number;
  rawText?: string | null;
}

export type WarningSeverity = "INFO" | "WARNING" | "CRITICAL";

export interface AnalysisWarningInput {
  code: string;
  severity: WarningSeverity;
  source: "PIPELINE" | "VALIDATOR" | "AUDITOR" | "EXTRACTION";
  message: string;
  subjectId?: string | null;
  sourcePage?: number | null;
  /** Dados estruturados para ações na UI. */
  data?: Record<string, unknown> | null;
}

export type ReliabilityLevel = "HIGH" | "REVIEW_RECOMMENDED" | "REVIEW_REQUIRED";
