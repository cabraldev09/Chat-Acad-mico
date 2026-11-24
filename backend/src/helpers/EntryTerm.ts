// The entry term of a student ("2026/2"): the semester the enrollment is for. The polo goals count an enrollment in the semester of its
// entry term, whatever the day it was made (a student of 2026/2 enrolled on 23/11 counts in the 2nd semester of 2026, even after the
// end of that period, as the company's spreadsheet does). Without a term on the lead, or a term no polo goal has, the day decides.

// "2026/2", "2026.2", "2026-2", "2026 2" -> "2026/2"; anything else -> null
export const normTerm = (value: unknown): string | null => {
  const m = String(value ?? "").match(/(20\d{2})\s*[./\-\s]\s*([12])\b/);
  return m ? `${m[1]}/${m[2]}` : null;
};

// "Graduação 2º semestre de 2026" -> "2026/2"
export const termOfTitle = (title: unknown): string | null => {
  const m = String(title ?? "").match(/([12])\s*[ºo°]?\s*semestre\s+de\s+(20\d{2})/i);
  return m ? `${m[2]}/${m[1]}` : null;
};

// the entry term of a polo goal: the one set on it, else the one in its title
export const goalTerm = (goal: { entryTerm?: unknown; title?: unknown }): string | null => normTerm(goal.entryTerm) || termOfTitle(goal.title);

// Does an enrollment count in this goal? By the lead's entry term when the goal has one and the term belongs to some polo goal
// (knownTerms); else by the day, inside the goal's period.
export const countsInGoal = (
  row: { entryTerm?: unknown; day: string },
  goal: { term: string | null; start: string; end: string },
  knownTerms: Set<string>
): boolean => {
  const term = normTerm(row.entryTerm);
  if (term && goal.term && knownTerms.has(term)) return term === goal.term;
  return row.day >= goal.start && row.day <= goal.end;
};
