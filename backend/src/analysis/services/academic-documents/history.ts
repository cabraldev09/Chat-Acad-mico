import type {
  AcademicDiscipline,
  AcademicGridSnapshot,
} from "../../domain/academic-analysis/types";
import { academicStatusOutcome } from "../../domain/academic-analysis/rules";
import { analyzeAcademicGrid } from "../../domain/academic-analysis/analyze";
import { applyHistoryPeriodInference } from "../../domain/academic-analysis/history-period-inference";
import type { LocalExtraction } from "../pdf/parser";
import { foldDocument, type AcademicDocumentType } from "./classifier";

/** History table rows span many visual lines; academicTerm is never a curricular period. */
export function extractAcademicHistory(
  local: LocalExtraction,
  type: AcademicDocumentType,
  previous?: AcademicGridSnapshot | null,
): AcademicGridSnapshot {
  const text = local.textByPage.join("\n");
  const rgm = text.match(/\bRGM\s*:\s*([\d.-]+)/i)?.[1] ?? null;
  const studentName =
    text.match(/\bNome\s*:\s*([^\n\t]+)/i)?.[1]?.trim() ?? null;
  const courseName =
    text.match(/\bCurso\s*:\s*([^\n\t]+)/i)?.[1]?.trim() ?? null;
  const workload = (label: string) => {
    const found = foldDocument(text).match(
      new RegExp(
        `CARGA HORARIA ${label}\\s*:?\\s*([\\d.,]+)\\s*(?:HORAS|H\\b)`,
      ),
    );
    return found ? Number(found[1].replace(/\./g, "").replace(",", ".")) : null;
  };
  const oldRows = new Map<string, AcademicDiscipline>();
  const ambiguous = new Set<string>();
  for (const row of previous?.disciplines ?? [])
    if (row.code) {
      if (oldRows.has(row.code)) ambiguous.add(row.code);
      else oldRows.set(row.code, row);
    }
  const disciplines: AcademicDiscipline[] = [];
  const warnings: string[] = [];
  let expectedCount = 0;
  for (const page of local.pages) {
    const lines = [...page.lines].sort((a, b) => b.y - a.y);
    const header = lines.find(
      (l) =>
        /DISCIPLINA/.test(foldDocument(l.text)) &&
        /SITUACAO/.test(foldDocument(l.text)) &&
        /MEDIA/.test(foldDocument(l.text)),
    );
    if (!header) continue;
    const x = (pattern: RegExp) =>
      header.parts.find((p) => pattern.test(foldDocument(p.text)))?.x;
    const termX = x(/^PERIODO$/),
      hoursX = x(/^C\s*\/\s*HORARIA$/),
      gradeX = x(/^MEDIA$/),
      statusX = x(/^SITUACAO$/),
      teacherX = x(/^DOCENTE/);
    if ([termX, hoursX, gradeX, statusX, teacherX].some((v) => v === undefined))
      continue;
    const starts = lines.filter(
      (l) =>
        l.y < header.y &&
        l.parts.some(
          (p) => p.x < termX! - 6 && /^\d+\s*[-–]/.test(p.text.trim()),
        ),
    );
    expectedCount += starts.length;
    const footerY = Math.max(
      20,
      ...lines
        .filter(
          (l) =>
            l.y < header.y &&
            /Atividades Complementares|Legendas|Dados Complementares/i.test(
              l.text,
            ),
        )
        .map((l) => l.y),
    );
    for (let i = 0; i < starts.length; i++) {
      const parts = lines
        .filter(
          (l) =>
            l.y <= starts[i].y &&
            l.y > (starts[i + 1]?.y ?? footerY) &&
            !/Atividades Complementares|Legendas|Dados Complementares/i.test(
              l.text,
            ),
        )
        .flatMap((l) => l.parts);
      const cell = (from: number, to: number) =>
        parts
          .filter((p) => p.x >= from - 6 && p.x < to - 6)
          .map((p) => p.text.trim())
          .join(" ")
          .replace(/\s+/g, " ")
          .trim();
      const identity = cell(0, termX!);
      const match = identity.match(/^(\d+)\s*[-–]\s*(.+)/);
      if (!match) continue;
      const code = match[1];
      const old = ambiguous.has(code) ? undefined : oldRows.get(code);
      const term = cell(termX!, hoursX!).match(/\b\d{4}\/[12]\b/)?.[0] ?? null;
      const grade =
        cell(gradeX!, statusX!)
          .replace(/\*{2,}/g, "")
          .trim() || null;
      const situation = foldDocument(cell(statusX!, teacherX!));
      const hourMatch = cell(hoursX!, gradeX!).match(/^\d+(?:[.,]\d+)?/);
      const hours = hourMatch ? Number(hourMatch[0].replace(",", ".")) : null;
      let status = "NAO IDENTIFICADO";
      if (/APROVADO|DISPENSADO|APROVEITAMENTO/.test(situation))
        status = /^AE\*?$/.test(grade ?? "")
          ? old && /^AE\*?$/.test(old.normalizedStatus)
            ? old.normalizedStatus
            : grade!
          : grade && /^\d+(?:[.,]\d+)?$/.test(grade)
            ? grade
            : "APROVADO";
      else if (/PENDENTE/.test(situation))
        status = old?.normalizedStatus === "CURSANDO" ? "CURSANDO" : "A CURSAR";
      else if (/REPROVADO/.test(situation)) status = "REPROVADO";
      else if (/CURSANDO|EM CURSO/.test(situation)) status = "CURSANDO";
      if (
        status === "APROVADO" &&
        old &&
        ["COMPLETED", "EXEMPT"].includes(
          academicStatusOutcome(old.normalizedStatus),
        )
      )
        status = old.normalizedStatus;
      disciplines.push({
        code,
        name: old?.name ?? match[2],
        rawPeriod: old?.rawPeriod ?? "",
        period: old?.period ?? null,
        academicTerm: term,
        grade,
        originalStatus: situation,
        normalizedStatus: status,
        workload: hours ?? old?.workload ?? null,
        inMainCurriculum: old?.inMainCurriculum ?? true,
        sourcePage: page.page,
        sourceRow: disciplines.length + 1,
        manualEdited: false,
        curricularPeriodProvenance: old?.curricularPeriodProvenance ?? {
          source: old?.manualEdited
            ? "TUTOR_CONFIRMED"
            : old?.period
              ? "PREVIOUS_ANALYSIS"
              : "UNMAPPED",
          confirmed: old?.period != null,
        },
      });
    }
  }
  const recoveredCount = disciplines.length;
  let currentPeriod = previous?.result.currentPeriod ?? null;
  let currentPeriodConfirmed = previous?.result.currentPeriodConfirmed ?? false;
  const mapped = applyHistoryPeriodInference({
    disciplines,
    result: analyzeAcademicGrid({ disciplines, currentPeriod, currentPeriodConfirmed }),
    studentName,
    rgm,
    courseName,
    extractionWarnings: [],
    manuallyEdited: false,
  });
  if (mapped.applied) {
    disciplines.splice(0, disciplines.length, ...mapped.snapshot.disciplines);
    currentPeriod = mapped.snapshot.result.currentPeriod;
    currentPeriodConfirmed = mapped.snapshot.result.currentPeriodConfirmed;
  }
  // Missing rows in a newer document are not evidence that prior curriculum knowledge is wrong.
  for (const row of previous?.disciplines ?? [])
    if (!disciplines.some((r) => r.code && r.code === row.code))
      disciplines.push(row);
  const mappingRequired =
    disciplines.some((r) => r.inMainCurriculum && r.period === null) ||
    !currentPeriodConfirmed;
  if (mappingRequired)
    warnings.push(
      "MAPEAMENTO CURRICULAR NECESSÁRIO: o tutor deve confirmar a posição curricular e o período atual. Semestre letivo não é período curricular.",
    );
  if (expectedCount === 0)
    warnings.push(
      "Não foi possível reconhecer a tabela de disciplinas do histórico.",
    );
  const result = analyzeAcademicGrid({
    disciplines,
    currentPeriod,
    currentPeriodConfirmed,
  });
  return {
    documentType: type,
    studentName,
    rgm,
    courseName,
    disciplines,
    result,
    plannedWorkload: workload("PREVISTA"),
    integralizedWorkload: workload("INTEGRALIZADA"),
    mappingRequired,
    sourceDisciplineCount: expectedCount,
    sourceParsedDisciplineCount: recoveredCount,
    extractionWarnings: warnings,
    manuallyEdited: false,
  };
}
