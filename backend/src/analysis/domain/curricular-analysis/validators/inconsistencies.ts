import type { AnalysisWarningInput, CurriculumTotals, SubjectRow } from "../types";

/**
 * detectInconsistencies — problemas estruturais observáveis nos dados extraídos.
 * Não altera nada; só reporta.
 */
export function detectInconsistencies(subjects: SubjectRow[], totals: CurriculumTotals): AnalysisWarningInput[] {
  const warnings: AnalysisWarningInput[] = [];

  if (subjects.length === 0) {
    warnings.push({
      code: "NO_SUBJECTS_FOUND",
      severity: "CRITICAL",
      source: "VALIDATOR",
      message: "Nenhuma disciplina foi identificada no documento.",
    });
    return warnings;
  }

  // Períodos ausentes na sequência 1..max
  const max = Math.max(...totals.periods);
  for (let p = 1; p <= max; p++) {
    if (!totals.byPeriod[p]) {
      warnings.push({
        code: "MISSING_PERIOD",
        severity: "WARNING",
        source: "VALIDATOR",
        message: `Nenhuma disciplina do ${p}º período foi encontrada. Verifique se a tabela está completa.`,
      });
    }
  }

  for (const s of subjects) {
    if (s.readability === "UNREADABLE") {
      warnings.push({
        code: "UNREADABLE_ROW",
        severity: "CRITICAL",
        source: "VALIDATOR",
        message: `Linha ilegível: "${s.name}" (página ${s.sourcePage}, linha ${s.sourceRow}).`,
        subjectId: s.id,
        sourcePage: s.sourcePage,
      });
    } else if (s.readability === "UNCLEAR") {
      warnings.push({
        code: "UNCLEAR_ROW",
        severity: "WARNING",
        source: "VALIDATOR",
        message: `Leitura duvidosa: "${s.name}" (página ${s.sourcePage}, linha ${s.sourceRow}).`,
        subjectId: s.id,
        sourcePage: s.sourcePage,
      });
    }
    if (!Number.isInteger(s.period) || s.period < 1) {
      warnings.push({
        code: "INVALID_PERIOD",
        severity: "CRITICAL",
        source: "VALIDATOR",
        message: `Período inválido (${s.period}) em "${s.name}".`,
        subjectId: s.id,
        sourcePage: s.sourcePage,
      });
    }
    if (!Number.isFinite(s.workload) || s.workload < 0) {
      warnings.push({
        code: "INVALID_WORKLOAD",
        severity: "WARNING",
        source: "VALIDATOR",
        message: `Carga horária inválida (${s.workload}) em "${s.name}".`,
        subjectId: s.id,
        sourcePage: s.sourcePage,
      });
    }
    if (!s.name.trim()) {
      warnings.push({
        code: "EMPTY_SUBJECT_NAME",
        severity: "CRITICAL",
        source: "VALIDATOR",
        message: `Disciplina sem nome (página ${s.sourcePage}, linha ${s.sourceRow}).`,
        subjectId: s.id,
        sourcePage: s.sourcePage,
      });
    }
  }

  // Duplicidade exata de identidade (não é deduplicação: apenas alerta técnico)
  const seen = new Set<string>();
  for (const s of subjects) {
    if (seen.has(s.id)) {
      warnings.push({
        code: "DUPLICATE_ROW_ID",
        severity: "CRITICAL",
        source: "VALIDATOR",
        message: `Identificador de linha duplicado para "${s.name}".`,
        subjectId: s.id,
      });
    }
    seen.add(s.id);
  }

  return warnings;
}
