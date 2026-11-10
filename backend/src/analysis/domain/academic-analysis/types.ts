import type { AcademicRules } from "../curricular-analysis/rules/types";

export interface AcademicDiscipline {
  code: string | null;
  name: string;
  rawPeriod: string;
  period: number | null;
  originalStatus: string;
  normalizedStatus: string;
  workload: number | null;
  inMainCurriculum: boolean;
  sourcePage: number;
  sourceRow: number;
  manualEdited: boolean;
  academicTerm?: string | null;
  grade?: string | null;
  curricularPeriodProvenance?: { source: string; confirmed: boolean };

}

export type AcademicReviewStatus =
  | "NO_PENDING"
  | "CAN_ADD"
  | "NEAR_LIMIT"
  | "LIMIT_REACHED"
  | "MANUAL_REVIEW_REQUIRED"
  | "ENROLLMENT_INACTIVE";

/** Situation of the student's enrollment in the academic system (SIAA): only an active one can add subjects. */
export type EnrollmentSituationCode = "ACTIVE" | "CANCELLED" | "LOCKED" | "GRADUATED" | "TRANSFERRED";
export interface EnrollmentSituation {
  code: EnrollmentSituationCode;
  label: string;
  source: "DOCUMENT" | "STAFF";
}

/** What the document suggests as the current period, and what the check by workload says. */
export interface PeriodSuggestion {
  inferred: number | null;
  byWorkload: number | null;
  method: "LATEST_TERM" | null;
  agrees: boolean;
  note: string;
}

export interface AcademicGridResult {
  currentPeriod: number | null;
  currentPeriodConfirmed: boolean;
  currentPeriodComponents: number;
  previousPending: number;
  previousAlreadyAdded: number;
  currentPeriodAE: number;
  baseExtraAllowance: number;
  extraAllowance: number;
  semesterMaximum: number;
  usedExtraSlots: number;
  remainingExtraSlots: number;
  canAddNow: number;
  pendingAfterPossibleInclusion: number;
  status: AcademicReviewStatus;
  pendingByPeriod: Record<string, number>;
  pendingDisciplines: AcademicDiscipline[];
  previousCoursesInProgress: AcademicDiscipline[];
  suggestedCourses: AcademicDiscipline[];
  warnings: string[];
}

export interface AcademicGridSnapshot {
  documentType?: "OFFICIAL_ACADEMIC_HISTORY" | "SIMPLE_ACADEMIC_HISTORY" | "CURRICULAR_EXTRACT" | "UNKNOWN_ACADEMIC_DOCUMENT";
  plannedWorkload?: number | null;
  integralizedWorkload?: number | null;
  mappingRequired?: boolean;
  enrollmentSituation?: EnrollmentSituation | null;
  periodSuggestion?: PeriodSuggestion | null;
  disciplines: AcademicDiscipline[];
  result: AcademicGridResult;
  projectionRules?: AcademicRules;
  projectionRulesVersion?: string;
  studentName: string | null;
  rgm: string | null;
  courseName: string | null;
  extractionWarnings: string[];
  /** Independent source-text row count for SIAA completeness checks. */
  sourceDisciplineCount?: number;
  /** Rows initially recovered by the coordinate-based parser, before tutor additions. */
  sourceParsedDisciplineCount?: number;
  manuallyEdited: boolean;
  message?: string;
}
