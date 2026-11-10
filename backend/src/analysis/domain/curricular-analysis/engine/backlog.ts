import type { AcademicRules } from "../rules/types";
import type { SubjectRow } from "../types";

/** Disciplinas que precisam ser cursadas (pendentes e, se configurado, a revisar). */
export function needsToBeTaken(subject: SubjectRow, rules: Pick<AcademicRules, "reviewCountsAsPending">): boolean {
  if (subject.status === "PENDING") return true;
  if (subject.status === "REVIEW") return rules.reviewCountsAsPending;
  return false;
}

/**
 * calculatePreviousBacklog — pendências de períodos ANTERIORES ao período de ingresso (§14),
 * ordenadas: período mais antigo primeiro; dentro do período, ordem do documento (§15).
 */
export function calculatePreviousBacklog(
  subjects: SubjectRow[],
  entryPeriod: number,
  rules: Pick<AcademicRules, "reviewCountsAsPending" | "backlogOrdering">,
): SubjectRow[] {
  return subjects
    .filter((s) => s.period < entryPeriod && needsToBeTaken(s, rules))
    .sort((a, b) => (a.period !== b.period ? a.period - b.period : a.sortIndex - b.sortIndex));
}

/** allocateBacklogSubjects — consome até `capacity` itens do backlog preservando a ordem. */
export function allocateBacklogSubjects<T>(backlog: T[], capacity: number): { allocated: T[]; remaining: T[] } {
  const n = Math.max(0, Math.min(capacity, backlog.length));
  return { allocated: backlog.slice(0, n), remaining: backlog.slice(n) };
}
