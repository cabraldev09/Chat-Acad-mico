import type { LocalExtraction } from "../pdf/parser";
import { effectiveRows } from "../pdf/table-detector";
import { hasValidUsedSubject } from "../../domain/curricular-analysis/engine/classify";
import type { AnalysisWarningInput } from "../../domain/curricular-analysis/types";
import type { NormalizedSubject } from "./normalize";

/**
 * Cruzamento determinístico entre a tabela reconstruída localmente (camada 2) e a extração da IA (camada 3).
 * Não altera nada; gera alertas para revisão quando as duas leituras divergem.
 */
export function crossCheckWithLocalTable(local: LocalExtraction | null, subjects: NormalizedSubject[]): AnalysisWarningInput[] {
  const rows = local?.table ? effectiveRows(local.table) : [];
  if (rows.length === 0) return [];
  const warnings: AnalysisWarningInput[] = [];

  if (rows.length !== subjects.length) {
    warnings.push({
      code: "LOCAL_ROW_COUNT_MISMATCH",
      severity: "CRITICAL",
      source: "VALIDATOR",
      message: `A tabela do PDF tem ${rows.length} disciplinas e a análise ficou com ${subjects.length}. Confira se falta ou sobra alguma linha na grade.`,
      data: { kind: "COUNT_MISMATCH", localCount: rows.length, aiCount: subjects.length },
    });
  }

  const byCode = new Map(subjects.filter((s) => s.code).map((s) => [s.code as string, s]));
  for (const r of rows) {
    if (!r.code) continue;
    const s = byCode.get(r.code);
    if (!s) {
      warnings.push({
        code: "LOCAL_ROW_NOT_EXTRACTED",
        severity: "CRITICAL",
        source: "VALIDATOR",
        message: `A disciplina "${r.name}" (código ${r.code}, página ${r.page}) está na tabela do PDF, mas não entrou na análise.`,
        sourcePage: r.page,
        data: { kind: "MISSING_ROW", row: { code: r.code, name: r.name, workload: r.workload, period: r.period, usedSubject: r.usedSubject, page: r.page, rowIndex: r.rowIndex } },
      });
      continue;
    }
    if (r.period !== null && r.period !== s.period) {
      warnings.push({
        code: "LOCAL_PERIOD_MISMATCH",
        severity: "CRITICAL",
        source: "VALIDATOR",
        message: `"${s.name}": o PDF indica ${r.period}º período; a análise ficou com ${s.period}º.`,
        sourcePage: r.page,
        data: { kind: "FIELD_MISMATCH", rowHash: s.rowHash, field: "period", localValue: r.period, aiValue: s.period, recommended: "LOCAL" },
      });
    }
    if (r.workload !== null && r.workload !== s.workload) {
      warnings.push({
        code: "LOCAL_WORKLOAD_MISMATCH",
        severity: "WARNING",
        source: "VALIDATOR",
        message: `"${s.name}": o PDF indica ${r.workload}h; a análise ficou com ${s.workload}h.`,
        sourcePage: r.page,
        data: { kind: "FIELD_MISMATCH", rowHash: s.rowHash, field: "workload", localValue: r.workload, aiValue: s.workload, recommended: "LOCAL" },
      });
    }
    const localExempted = hasValidUsedSubject(r.usedSubject);
    const aiExempted = hasValidUsedSubject(s.usedSubject);
    if (localExempted !== aiExempted) {
      warnings.push({
        code: "LOCAL_USED_SUBJECT_MISMATCH",
        severity: "CRITICAL",
        source: "VALIDATOR",
        message: aiExempted
          ? `"${s.name}": a análise considerou aproveitada por "${s.usedSubject}", mas a leitura simples do PDF não encontrou disciplina utilizada.`
          : `"${s.name}": a leitura simples do PDF encontrou "${r.usedSubject}" como disciplina utilizada, mas a análise considerou pendente.`,
        sourcePage: r.page,
        data: { kind: "FIELD_MISMATCH", rowHash: s.rowHash, field: "usedSubject", localValue: r.usedSubject, aiValue: s.usedSubject, recommended: "AI" },
      });
    }
  }
  return warnings;
}

/** Período de ingresso e metadados lidos deterministicamente do cabeçalho ("Série: 4", "Curso: ...", "Grade: ..."). */
export function readHeaderMetadata(local: LocalExtraction | null): { entryPeriod: number | null; course: string | null; matrix: string | null; campus: string | null; modality: string | null } {
  const f = local?.headerFields ?? {};
  const serie = f["serie"] ?? f["série"] ?? f["semestre de entrada"];
  const n = serie ? Number(serie.replace(/[^0-9]/g, "")) : NaN;
  return {
    entryPeriod: Number.isInteger(n) && n >= 1 && n <= 20 ? n : null,
    course: f["curso"] ?? null,
    matrix: f["grade"] ?? f["matriz"] ?? null,
    campus: f["campus"] ?? null,
    modality: f["periodo"] ?? f["modalidade"] ?? null,
  };
}
