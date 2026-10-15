import type { AcademicRules } from "../rules/types";

/**
 * Capacidade = disciplinas regulares do período + extras, respeitando opcionalmente
 * o teto institucional total. Ex.: período com 10, extra +3 e teto 11 recebe só +1.
 */
export function calculateMaximumCapacity(
  subjectsInPeriod: number,
  rules: Pick<AcademicRules, "extraSubjectsAllowed" | "maximumSubjectsPerSemester">,
): number {
  const regular = Math.max(0, subjectsInPeriod);
  const byExtraRule = regular + Math.max(0, rules.extraSubjectsAllowed);
  return rules.maximumSubjectsPerSemester === null
    ? byExtraRule
    : Math.max(regular, Math.min(byExtraRule, rules.maximumSubjectsPerSemester));
}

/** backlogCapacity = maximumCapacity − regularSubjectsToTake (§13). Nunca negativo. */
export function calculateBacklogCapacity(maximumCapacity: number, regularSubjectsToTake: number): number {
  return Math.max(0, maximumCapacity - regularSubjectsToTake);
}
