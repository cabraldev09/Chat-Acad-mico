import type { AnalysisWarningInput } from "../../domain/curricular-analysis/types";

// The official matrix of the course (catalog of grades) is the truth about the names and the série of each discipline. A reading made by the AI
// (a PDF with no text) can confuse roman numerals ("QUÍMICA II" for "III"); here every row read is matched to a discipline of the matrix, and
// the name and the série of the matrix win. The disciplines the matrix says were not read, and the rows that match nothing, are only reported.

export interface MatrixComponent {
  semester: number;
  code: string | null;
  name: string;
  workload: number | null;
  type: string | null;
}

export interface ReconcilableSubject {
  name: string;
  period: number;
  usedSubject: string | null;
  periodKnown?: boolean;
  matrixPeriod?: number;
}

const plain = (s: string): string =>
  String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();

const bigrams = (s: string): string[] => {
  const t = ` ${s} `;
  const out: string[] = [];
  for (let i = 0; i < t.length - 1; i += 1) out.push(t.slice(i, i + 2));
  return out;
};

// 0..1: how alike two names are (bigrams); the last word (the roman numeral) weighs on its own, so "II" and "III" do not look the same
export const similarity = (a: string, b: string, ignoreNumeral = false): number => {
  const x = plain(a);
  const y = plain(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const ga = bigrams(x);
  const gb = bigrams(y);
  const count = new Map<string, number>();
  gb.forEach(g => count.set(g, (count.get(g) || 0) + 1));
  let hit = 0;
  ga.forEach(g => {
    const n = count.get(g) || 0;
    if (n > 0) { hit += 1; count.set(g, n - 1); }
  });
  const dice = (2 * hit) / (ga.length + gb.length);
  const lastA = x.split(" ").pop();
  const lastB = y.split(" ").pop();
  const numerals = /^(I|II|III|IV|V|VI|VII|VIII|IX|X)$/;
  return !ignoreNumeral && numerals.test(lastA || "") && numerals.test(lastB || "") && lastA !== lastB ? Math.min(dice, 0.74) : dice;
};

export interface Reconciled<T> {
  subjects: Array<T & { matrixPeriod?: number }>;
  warnings: AnalysisWarningInput[];
  matched: number;
  missing: string[];
  unmatched: string[];
}

export const reconcileWithMatrix = <T extends ReconcilableSubject>(subjects: T[], matrix: MatrixComponent[]): Reconciled<T> => {
  const taken = new Set<number>();
  const pick = new Map<number, number>();
  const isPending = (s: T): boolean => !s.usedSubject;
  const bare = (name: string): string => plain(name).replace(/ (I|II|III|IV|V|VI|VII|VIII|IX|X)$/, "");

  // greedy by score: the pairs that look the most alike are settled first, and nobody takes a discipline twice
  const settle = (pairs: Array<{ i: number; j: number; score: number }>): void => {
    pairs.sort((x, y) => y.score - x.score);
    pairs.forEach(({ i, j }) => {
      if (pick.has(i) || taken.has(j)) return;
      taken.add(j);
      pick.set(i, j);
    });
  };
  const free = (i: number): number[] => matrix.map((_, j) => j).filter(j => !taken.has(j) && !pick.has(i));

  // 1) a pending row: the série printed in the document is reliable, so the discipline of the same série that looks the most like it wins
  //    (a misread numeral, or the same name in two séries, is settled by the série)
  const first: Array<{ i: number; j: number; score: number }> = [];
  subjects.forEach((s, i) => {
    if (!isPending(s)) return;
    matrix.forEach((m, j) => { if (m.semester === s.period) { const score = similarity(s.name, m.name, true); if (score >= 0.85) first.push({ i, j, score }); } });
  });
  settle(first);

  // 2) the same name (whatever the accents and the punctuation) among the disciplines still free
  const exact: Array<{ i: number; j: number; score: number }> = [];
  subjects.forEach((s, i) => { if (!pick.has(i)) free(i).forEach(j => { if (plain(matrix[j].name) === plain(s.name)) exact.push({ i, j, score: 1 }); }); });
  settle(exact);

  // 3) what is left: the most alike among the disciplines still free
  const alike: Array<{ i: number; j: number; score: number }> = [];
  subjects.forEach((s, i) => {
    if (pick.has(i)) return;
    free(i).forEach(j => {
      const score = similarity(s.name, matrix[j].name) + (isPending(s) && matrix[j].semester === s.period ? 0.15 : 0);
      if (score >= 0.8) alike.push({ i, j, score });
    });
  });
  settle(alike);

  // 4) a numeral misread (II read for III): when only one free discipline has the same name without the numeral, it is that one
  subjects.forEach((s, i) => {
    if (pick.has(i)) return;
    const same = free(i).filter(j => bare(matrix[j].name) === bare(s.name));
    if (same.length === 1) { taken.add(same[0]); pick.set(i, same[0]); }
  });

  const warnings: AnalysisWarningInput[] = [];
  const unmatched: string[] = [];
  const out = subjects.map((s, i) => {
    const j = pick.get(i);
    if (j === undefined) {
      unmatched.push(s.name);
      return { ...s };
    }
    const m = matrix[j];
    const next: T & { matrixPeriod?: number } = { ...s, name: plain(m.name) === plain(s.name) ? s.name : m.name.toUpperCase() };
    if (isPending(s)) {
      if (s.period !== m.semester) {
        warnings.push({ code: "MATRIX_PERIOD_CORRECTED", severity: "INFO", source: "PIPELINE", message: `“${next.name}” está no ${m.semester}º período da matriz do curso (o PDF foi lido como ${s.period}º).` });
        next.period = m.semester;
      }
    } else if (s.periodKnown === false) {
      // the exempted list of the unified result has no série: the matrix tells where each one belongs (only to show the grade; the forecast keeps the rule of the original)
      next.matrixPeriod = m.semester;
    }
    return next;
  });

  const missing = matrix.filter((_, j) => !taken.has(j)).map(m => `${m.name} (${m.semester}º)`);
  if (missing.length) warnings.push({ code: "MATRIX_SUBJECT_NOT_IN_DOCUMENT", severity: "INFO", source: "PIPELINE", message: `${missing.length} disciplina(s) da matriz do curso não aparecem no PDF: ${missing.slice(0, 6).join("; ")}${missing.length > 6 ? "…" : ""}.` });
  if (unmatched.length) warnings.push({ code: "SUBJECT_NOT_IN_MATRIX", severity: "INFO", source: "PIPELINE", message: `${unmatched.length} disciplina(s) do PDF não foram encontradas na matriz do curso: ${unmatched.slice(0, 6).join("; ")}${unmatched.length > 6 ? "…" : ""}.` });
  return { subjects: out, warnings, matched: pick.size, missing, unmatched };
};
