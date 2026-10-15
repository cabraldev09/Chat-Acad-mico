import type { AnalysisWarningInput, ReliabilityLevel, SubjectRow } from "../types";
import type { ValidationViolation } from "./validate";

export interface StatusInput {
  subjects: SubjectRow[];
  warnings: AnalysisWarningInput[];
  violations: ValidationViolation[];
  entryPeriodConfirmed: boolean;
  simulationIncomplete: boolean;
  auditorStatus: "OK" | "REVIEW" | null;
  auditorCriticalIssues: number;
  auditorMinorIssues: number;
}

export interface StatusResult {
  reliability: ReliabilityLevel;
  reviewItemsCount: number;
  reasons: string[];
}

/**
 * calculateAnalysisStatus — confiabilidade baseada em critérios verificáveis (§41).
 */
export function calculateAnalysisStatus(input: StatusInput): StatusResult {
  const reasons: string[] = [];
  let required = 0;
  let recommended = 0;

  const reviewRows = input.subjects.filter((s) => s.status === "REVIEW").length;
  const unreadable = input.subjects.filter((s) => s.readability === "UNREADABLE").length;
  if (unreadable > 0) {
    required += unreadable;
    reasons.push(`${unreadable} linha(s) ilegível(is)`);
  } else if (reviewRows > 0) {
    required += reviewRows;
    reasons.push(`${reviewRows} disciplina(s) marcada(s) para revisão`);
  }

  if (!input.entryPeriodConfirmed) {
    required += 1;
    reasons.push("período de ingresso não confirmado");
  }
  if (input.simulationIncomplete) {
    required += 1;
    reasons.push("regra de semestre adicional não configurada");
  }
  if (input.violations.length > 0) {
    required += input.violations.length;
    reasons.push(`${input.violations.length} violação(ões) de invariante`);
  }

  const critical = input.warnings.filter((w) => w.severity === "CRITICAL" && !["UNREADABLE_ROW"].includes(w.code));
  const minor = input.warnings.filter((w) => w.severity === "WARNING" && !["UNCLEAR_ROW"].includes(w.code));
  if (critical.length > 0) {
    required += critical.length;
    reasons.push(`${critical.length} divergência(s) crítica(s)`);
  }
  if (minor.length > 0) {
    recommended += minor.length;
    reasons.push(`${minor.length} alerta(s) não crítico(s)`);
  }

  if (input.auditorCriticalIssues > 0) {
    required += input.auditorCriticalIssues;
    reasons.push(`auditoria IA apontou ${input.auditorCriticalIssues} problema(s) importante(s)`);
  }
  if (input.auditorMinorIssues > 0) {
    recommended += input.auditorMinorIssues;
    reasons.push(`auditoria IA apontou ${input.auditorMinorIssues} observação(ões)`);
  }

  const reliability: ReliabilityLevel = required > 0 ? "REVIEW_REQUIRED" : recommended > 0 ? "REVIEW_RECOMMENDED" : "HIGH";
  return { reliability, reviewItemsCount: required + recommended, reasons };
}
