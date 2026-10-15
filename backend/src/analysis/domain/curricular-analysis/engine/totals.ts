import type { CurriculumTotals, SubjectRow } from "../types";

/** Agrupa por período preservando a ordem original do documento dentro de cada período. */
export function groupSubjectsByPeriod(subjects: SubjectRow[]): Map<number, SubjectRow[]> {
  const sorted = [...subjects].sort((a, b) => a.sortIndex - b.sortIndex);
  const map = new Map<number, SubjectRow[]>();
  for (const s of sorted) {
    const list = map.get(s.period) ?? [];
    list.push(s);
    map.set(s.period, list);
  }
  return new Map([...map.entries()].sort((a, b) => a[0] - b[0]));
}

/** Totais gerais e por período. Invariante: total = exempted + pending + review. */
export function calculateCurriculumTotals(subjects: SubjectRow[]): CurriculumTotals {
  const byPeriod: CurriculumTotals["byPeriod"] = {};
  let exempted = 0;
  let pending = 0;
  let review = 0;
  for (const s of subjects) {
    const p = (byPeriod[s.period] ??= { total: 0, exempted: 0, pending: 0, review: 0 });
    p.total += 1;
    if (s.status === "EXEMPTED") {
      p.exempted += 1;
      exempted += 1;
    } else if (s.status === "PENDING") {
      p.pending += 1;
      pending += 1;
    } else {
      p.review += 1;
      review += 1;
    }
  }
  const periods = Object.keys(byPeriod)
    .map(Number)
    .sort((a, b) => a - b);
  return { total: subjects.length, exempted, pending, review, periods, byPeriod };
}
