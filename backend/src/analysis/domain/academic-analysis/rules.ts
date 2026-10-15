export const ACADEMIC_RULES = {
  BASE_EXTRA_ALLOWANCE: 3,
  EXTRA_PER_CURRENT_PERIOD_AE: 1,
  MINIMUM_PASSING_GRADE: 6,
} as const;

export type AcademicStatusOutcome = "PENDING" | "IN_PROGRESS" | "EXEMPT" | "COMPLETED" | "UNKNOWN";

export function academicStatusOutcome(status: string): AcademicStatusOutcome {
  const normalized = status.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
  if (normalized === "A CURSAR" || normalized === "REPROVADO" || normalized === "REPROVADA" || normalized === "REPROVADO POR NOTA" || normalized === "REPROVADO POR FALTA") return "PENDING";
  if (normalized === "CURSANDO") return "IN_PROGRESS";
  if (normalized === "AE" || normalized === "AE*") return "EXEMPT";
  if (["APROVADO", "APROVADA", "CONCLUIDO", "CONCLUIDA", "DISPENSADO", "DISPENSADA", "S"].includes(normalized)) return "COMPLETED";
  const grade = normalized.match(/^(?:NOTA\s*)?(\d{1,3}(?:[,.]\d{1,2})?)$/)?.[1];
  if (grade) return Number(grade.replace(",", ".")) >= ACADEMIC_RULES.MINIMUM_PASSING_GRADE ? "COMPLETED" : "PENDING";
  return "UNKNOWN";
}
