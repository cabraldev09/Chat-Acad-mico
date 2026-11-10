import type { AcademicGridSnapshot } from "../../domain/academic-analysis/types";
import { applyHistoryPeriodInference } from "../../domain/academic-analysis/history-period-inference";

export type HistoryMappingMethod = "HEURISTIC" | "NONE";

export function isHistorySnapshot(snapshot: AcademicGridSnapshot): boolean {
  return snapshot.documentType === "SIMPLE_ACADEMIC_HISTORY" || snapshot.documentType === "OFFICIAL_ACADEMIC_HISTORY";
}

export function historyNeedsMapping(snapshot: AcademicGridSnapshot): boolean {
  return (
    isHistorySnapshot(snapshot) &&
    (!snapshot.result.currentPeriodConfirmed ||
      snapshot.disciplines.some((row) => row.inMainCurriculum && row.sourcePage > 0 && row.period === null))
  );
}

/**
 * Maps the curricular periods of a history from the structure of the document itself (deterministic). The original
 * system could also ask an AI when the structure was not conclusive; here the AI is off, so what cannot be mapped stays
 * for the tutor to confirm.
 */
export function autoMapHistorySnapshot(snapshot: AcademicGridSnapshot): { snapshot: AcademicGridSnapshot; method: HistoryMappingMethod; mappedRows: number } {
  if (!historyNeedsMapping(snapshot)) return { snapshot, method: "NONE", mappedRows: 0 };
  const heuristic = applyHistoryPeriodInference(snapshot);
  if (heuristic.applied) return { snapshot: heuristic.snapshot, method: "HEURISTIC", mappedRows: heuristic.mappedRows };
  return { snapshot, method: "NONE", mappedRows: 0 };
}
