import type { SubjectRow } from "@/domain/curricular-analysis/types";
import { DEFAULT_RULES, type AcademicRules } from "@/domain/curricular-analysis/rules/types";
import { classifySubject } from "@/domain/curricular-analysis/engine/classify";

let counter = 0;

export function makeSubject(partial: Partial<SubjectRow> & { period: number }): SubjectRow {
  counter++;
  const usedSubject = partial.usedSubject ?? null;
  const readability = partial.readability ?? "CLEAR";
  return {
    id: partial.id ?? `s${counter}`,
    name: partial.name ?? `DISCIPLINA ${counter}`,
    workload: partial.workload ?? 80,
    period: partial.period,
    usedSubject,
    status: partial.status ?? classifySubject({ usedSubject, readability }),
    readability,
    sourcePage: partial.sourcePage ?? 1,
    sourceRow: partial.sourceRow ?? counter,
    sortIndex: partial.sortIndex ?? counter,
  };
}

/** Cria `count` disciplinas em um período, com as `exempted` primeiras dispensadas. */
export function makePeriod(period: number, count: number, exempted = 0): SubjectRow[] {
  return Array.from({ length: count }, (_, i) =>
    makeSubject({ period, usedSubject: i < exempted ? `ORIGEM ${period}.${i + 1}` : null }),
  );
}

export function rules(overrides: Partial<AcademicRules> = {}): AcademicRules {
  return { ...DEFAULT_RULES, ...overrides };
}

export function resetCounter() {
  counter = 0;
}
