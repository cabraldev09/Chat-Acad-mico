import { academicDisciplineNeedsReview, analyzeAcademicGrid, normalizeAcademicStatus, parseAcademicPeriod } from "../../domain/academic-analysis/analyze";
import type { AcademicDiscipline, AcademicGridSnapshot } from "../../domain/academic-analysis/types";
import type { LocalExtraction, ParsedPage, TextLine, TextPart } from "../pdf/parser";

type Column = "code" | "name" | "period" | "workload" | "status";
type LocatedColumn = { kind: Column; x: number; text: string };

const fold = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
const lineParts = (line: TextLine): TextPart[] => line.parts.length ? line.parts : [{ x: line.x, w: line.w, text: line.text }];

function headerColumns(line: TextLine): LocatedColumn[] {
  const columns: LocatedColumn[] = [];
  for (const part of lineParts(line)) {
    const text = fold(part.text);
    let kind: Column | null = null;
    if (/^(COD|CODIGO|MATRICULA|ID)\b/.test(text)) kind = "code";
    else if (/DISCIPLINA|COMPONENTE|UNIDADE CURRICULAR/.test(text)) kind = "name";
    else if (/^(S\s*\/\s*T|PERIODO|SERIE|ETAPA|MODULO|SEMESTRE)\b/.test(text)) kind = "period";
    else if (/^(C\.?H\.?|CH|CARGA HORARIA|HORAS?)\b/.test(text)) kind = "workload";
    else if (/SITUACAO|STATUS|RESULTADO|NOTA/.test(text)) kind = "status";
    if (kind && !columns.some((column) => column.kind === kind)) columns.push({ kind, x: part.x + part.w / 2, text: part.text });
  }
  return columns;
}

function labelValue(text: string, labels: string[]): string | null {
  for (const label of labels) {
    const match = text.match(new RegExp(`(?:^|\\b)${label}\\s*[:\\-]?\\s*([^\\n\\t|]{2,100})`, "i"));
    const value = match?.[1]?.trim();
    if (value) return value.replace(/\s{2,}/g, " ").trim();
  }
  return null;
}

function extractSiaaMetadata(pages: ParsedPage[]) {
  let studentName: string | null = null;
  let rgm: string | null = null;
  let courseName: string | null = null;
  for (const line of pages.flatMap((page) => page.lines)) {
    const parts = lineParts(line);
    const studentIndex = parts.findIndex((part) => /^ALUNO\s*:/i.test(part.text.trim()));
    if (studentIndex >= 0) {
      const labelPart = parts[studentIndex].text.trim();
      const identifier = labelPart.match(/\b\d+\s*[-–]\s*(\d{4,})\b/);
      if (identifier) rgm = identifier[1];
      const nameInLabel = labelPart.replace(/^ALUNO\s*:\s*/i, "").replace(/^\d+\s*[-–]\s*\d{4,}\s*/, "").trim();
      const followingPart = parts.slice(studentIndex + 1).map((part) => part.text.trim()).find(Boolean);
      studentName = nameInLabel || followingPart || null;
    }
    const coursePart = parts.find((part) => /^CURSO\s*:/i.test(part.text.trim()));
    if (coursePart) {
      courseName = coursePart.text.trim().replace(/^CURSO\s*:\s*/i, "").replace(/^\d+\s*[-–]\s*/, "").trim() || null;
    }
  }
  return { studentName, rgm, courseName };
}

function findCurrentPeriod(fullText: string): { period: number | null; raw: string | null; confirmed: boolean } {
  const candidates = [
    /\bS\s*\/\s*T\s*[:\-]?\s*(\d{1,2}\s*\/\s*[A-Z])\b/i,
    /\b(?:PER[IÍ]ODO\s+ATUAL|PER[IÍ]ODO\s+DO\s+ALUNO|ETAPA\s+ATUAL)\s*[:\-]?\s*(\d{1,2})(?:\s*[ºª°])?/i,
    /\b(?:PER[IÍ]ODO|S[EÉ]RIE|ETAPA)\s*[:\-]\s*(\d{1,2})(?:\s*[ºª°])?/i,
  ];
  for (const pattern of candidates) {
    const match = fullText.match(pattern);
    if (!match) continue;
    const raw = match[1].replace(/\s+/g, "").trim();
    const period = parseAcademicPeriod(raw);
    if (period !== null) return { period, raw: match[1].trim(), confirmed: true };
  }
  return { period: null, raw: null, confirmed: false };
}

function cellForX(parts: TextPart[], columns: LocatedColumn[], target: Column): string {
  const sorted = [...columns].sort((a, b) => a.x - b.x);
  const column = sorted.find((item) => item.kind === target);
  if (!column) return "";
  const index = sorted.indexOf(column);
  const min = index === 0 ? Number.NEGATIVE_INFINITY : (sorted[index - 1].x + column.x) / 2;
  const max = index === sorted.length - 1 ? Number.POSITIVE_INFINITY : (column.x + sorted[index + 1].x) / 2;
  return parts.filter((part) => {
    const center = part.x + part.w / 2;
    return center >= min && center < max;
  }).map((part) => part.text.trim()).filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

function isAcademicStatus(value: string): boolean {
  const status = normalizeAcademicStatus(value);
  return status === "A CURSAR" || status === "CURSANDO" || status === "AE" || status === "AE*" || status === "S" || status === "APROVADO" || status === "CONCLUIDO" || status === "DISPENSADO" || status === "REPROVADO" || /^\d{1,3}(?:[,.]\d{1,2})?$/.test(status);
}

function extractHeaderedRows(pages: ParsedPage[]): AcademicDiscipline[] {
  const disciplines: AcademicDiscipline[] = [];
  let layout: LocatedColumn[] | null = null;
  let rowIndex = 0;
  for (const page of pages) {
    const sortedLines = [...page.lines].sort((a, b) => b.y - a.y);
    const pageHeader = sortedLines.find((line) => {
      const columns = headerColumns(line);
      return columns.some((column) => column.kind === "name") && columns.some((column) => column.kind === "period") && columns.some((column) => column.kind === "status");
    });
    if (pageHeader) layout = headerColumns(pageHeader);
    if (!layout) continue;
    const periodColumn = layout.find((column) => column.kind === "period");
    const startY = pageHeader?.y ?? Number.POSITIVE_INFINITY;
    for (const line of sortedLines) {
      if (line.y >= startY - 1 || line.y < 20) continue;
      const parts = lineParts(line);
      const originalStatus = cellForX(parts, layout, "status");
      const rawPeriod = cellForX(parts, layout, "period");
      if (!originalStatus || !isAcademicStatus(originalStatus) || !rawPeriod) continue;
      const period = parseAcademicPeriod(rawPeriod);
      const rawName = cellForX(parts, layout, "name");
      const name = rawName.replace(/\s+/g, " ").trim();
      if (!name || !periodColumn || !period) continue;
      const rawWorkload = cellForX(parts, layout, "workload");
      const workloadMatch = rawWorkload.match(/\d{1,4}/);
      const rawCode = cellForX(parts, layout, "code");
      rowIndex++;
      disciplines.push({
        code: rawCode || null,
        name,
        rawPeriod,
        period,
        originalStatus,
        normalizedStatus: normalizeAcademicStatus(originalStatus),
        workload: workloadMatch ? Number(workloadMatch[0]) : null,
        inMainCurriculum: true,
        sourcePage: page.page,
        sourceRow: rowIndex,
        manualEdited: false,
      });
    }
  }
  return disciplines;
}

function explicitStatus(value: string): boolean {
  const status = normalizeAcademicStatus(value);
  return status === "A CURSAR" || status === "CURSANDO" || status === "AE" || status === "AE*" || status === "APROVADO" || status === "CONCLUIDO" || status === "DISPENSADO" || status === "REPROVADO" || status === "S";
}

/**
 * Segunda conferência independente da grade SIAA: conta as linhas de
 * componente pelo código no texto linear original. O parser principal usa
 * coordenadas X e situação; assim, até uma linha com situação nova/deslocada
 * precisa aparecer na grade ou bloquear a projeção.
 */
function countLinearSiaaRows(pages: ParsedPage[]): number {
  return pages.flatMap((page) => page.lines).filter((line) => /^\s*\d{3,8}\s*(?:[-–]|\t)/.test(line.text)).length;
}

function extractHeaderlessSiaaRows(pages: ParsedPage[]): { disciplines: AcademicDiscipline[]; skippedRows: number } {
  const disciplines: AcademicDiscipline[] = [];
  let rowIndex = 0;
  let skippedRows = 0;
  for (const page of pages) {
    const sortedLines = [...page.lines].sort((a, b) => b.y - a.y);
    const hardStatusParts = sortedLines.flatMap((line) => lineParts(line).filter((part) => explicitStatus(part.text)));
    if (!hardStatusParts.length) continue;
    const rightEdges = hardStatusParts.map((part) => part.x + part.w).sort((a, b) => a - b);
    const statusRightEdge = rightEdges[Math.floor(rightEdges.length / 2)];
    let inMainCurriculum = true;
    for (const line of sortedLines) {
      const foldedLine = fold(line.text);
      if (foldedLine.includes("DISCIPLINAS IMPORTADAS QUE NAO PERTENCEM A GRADE")) {
        inMainCurriculum = false;
        continue;
      }
      if (line.y < 20) continue;
      const parts = lineParts(line).sort((a, b) => a.x - b.x);
      const statusPart = parts.find((part) => {
        const value = normalizeAcademicStatus(part.text);
        const isGrade = /^\d{1,3}(?:[,.]\d{1,2})?$/.test(value);
        return (explicitStatus(value) || (isGrade && Math.abs(part.x + part.w - statusRightEdge) <= 18)) && Math.abs(part.x + part.w - statusRightEdge) <= 22;
      });
      if (!statusPart) continue;
      const statusIndex = parts.indexOf(statusPart);
      const beforeStatus = parts.slice(0, statusIndex);
      const periodCellPattern = /^\d{1,2}\s*[ºª°]?(?:\s+[A-Z])?$/i;
      const inlinePeriodPattern = /\s+(\d{1,2}\s*[ºª°](?:\s+[A-Z])?)$/i;
      // In some SIAA exports, a long course name and its curricular period are
      // emitted as a single PDF text fragment. Prefer the known period column,
      // then fall back to a period suffix crossing that column boundary.
      const periodPart = beforeStatus.find((part) => part.x >= 340 && part.x < 415 && periodCellPattern.test(part.text.trim()));
      const inlinePeriodPart = periodPart ? null : beforeStatus.find((part) => part.x < 370 && part.x + part.w >= 350 && inlinePeriodPattern.test(part.text));
      const rawPeriod = periodPart?.text.trim() ?? inlinePeriodPart?.text.match(inlinePeriodPattern)?.[1]?.trim() ?? "";
      const period = rawPeriod ? parseAcademicPeriod(rawPeriod) : null;
      const nameParts = beforeStatus.filter((part) => part.x < 350 && !periodCellPattern.test(part.text.trim()));
      const rawName = nameParts.map((part) => part.text.replace(inlinePeriodPattern, "").trim()).filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
      const codeMatch = rawName.match(/^(\d{3,8})\s*[-–]\s*(.*)$/);
      const extractedName = (codeMatch?.[2] ?? rawName).trim();
      const unidentifiedName = !extractedName || /^\d{4}\/\d/.test(extractedName);
      if (unidentifiedName) skippedRows++;
      if (period === null) skippedRows++;
      const name = unidentifiedName ? `COMPONENTE NÃO IDENTIFICADO (página ${page.page}, linha ${rowIndex + 1})` : extractedName;
      const workloadPart = parts.slice(statusIndex + 1).find((part) => /^\d{1,4}$/.test(part.text.trim()));
      const originalStatus = statusPart.text.trim();
      const normalizedStatus = /^\d{1,3}(?:[,.]\d{1,2})?$/.test(originalStatus)
        ? `NOTA ${originalStatus.replace(",", ".")}`
        : normalizeAcademicStatus(originalStatus);
      rowIndex++;
      disciplines.push({
        code: codeMatch?.[1] ?? null,
        name,
        rawPeriod,
        period,
        originalStatus,
        normalizedStatus,
        workload: workloadPart ? Number(workloadPart.text.trim()) : null,
        inMainCurriculum,
        sourcePage: page.page,
        sourceRow: rowIndex,
        manualEdited: false,
      });
    }
  }
  return { disciplines, skippedRows };
}

export function extractAcademicGrid(local: LocalExtraction, filename: string): AcademicGridSnapshot {
  const fullText = local.textByPage.join("\n");
  const { period, confirmed } = findCurrentPeriod(fullText);
  const headeredRows = extractHeaderedRows(local.pages);
  const isSiaaTranscript = /INFORMA[CÇ][OÕ]ES ACAD[EÊ]MICAS DO ALUNO/i.test(fullText) && /\bS\s*\/\s*T\s*[:\-]?\s*\d{1,2}\s*\/\s*[A-Z]\b/i.test(fullText);
  const siaaRows = !headeredRows.length && isSiaaTranscript ? extractHeaderlessSiaaRows(local.pages) : null;
  const disciplines = headeredRows.length ? headeredRows : siaaRows?.disciplines ?? [];
  const foundTable = headeredRows.length > 0 || (isSiaaTranscript && disciplines.length > 0);
  const extractionWarnings: string[] = [];
  const sourceDisciplineCount = isSiaaTranscript ? countLinearSiaaRows(local.pages) : undefined;
  if (!fullText.trim()) extractionWarnings.push("O PDF não contém texto selecionável. Este módulo não executa OCR; revise ou gere uma versão pesquisável do documento.");
  if (!confirmed) extractionWarnings.push("Não foi possível identificar o período atual com segurança. Confirme o período manualmente.");
  if (!foundTable || disciplines.length === 0) extractionWarnings.push("Não foi possível interpretar automaticamente a tabela principal. Revise os dados identificados e a classificação da grade.");
  if (disciplines.some((discipline) => academicDisciplineNeedsReview(discipline))) extractionWarnings.push("Há componentes da grade principal com nome, período ou situação que precisam de conferência manual.");
  if ((siaaRows?.skippedRows ?? 0) > 0) extractionWarnings.push(`${siaaRows?.skippedRows} campo(s) de linha acadêmica precisam de conferência. As linhas foram mantidas na grade; dados sem período legível não entram nos cálculos.`);
  if (sourceDisciplineCount !== undefined) {
    if (sourceDisciplineCount !== disciplines.length) {
      extractionWarnings.push(`A conferência automática encontrou ${sourceDisciplineCount} linha(s) acadêmica(s) no texto do PDF, mas ${disciplines.length} na grade. Revise todas as páginas antes de usar a projeção.`);
    }
  }
  // A final preposition is not evidence of clipping: SIAA course names can
  // legitimately end in words such as "do" or "para". Only report explicit
  // ellipsis markers; a plain extracted string is preserved without guessing.
  const visiblyTruncatedTitles = disciplines.filter((discipline) => /(?:\.{3,}|…)\s*$/u.test(discipline.name)).length;
  if (visiblyTruncatedTitles > 0) extractionWarnings.push(`${visiblyTruncatedTitles} título(s) contêm reticências no próprio PDF; confira o nome completo antes de compartilhar.`);
  const genericStudentName = labelValue(fullText, ["Nome do aluno", "Aluno", "Discente"]);
  const siaaMetadata = isSiaaTranscript ? extractSiaaMetadata(local.pages) : null;
  const studentName = siaaMetadata?.studentName ?? genericStudentName;
  const rgm = siaaMetadata?.rgm ?? labelValue(fullText, ["RGM", "Matr[ií]cula"]);
  const courseName = siaaMetadata?.courseName ?? labelValue(fullText, ["Curso", "Curso de gradua[cç][aã]o"]);
  const result = analyzeAcademicGrid({ disciplines, currentPeriod: period, currentPeriodConfirmed: confirmed });
  if ((siaaRows?.skippedRows ?? 0) > 0 || extractionWarnings.some((warning) => warning.startsWith("A conferência automática encontrou")) || disciplines.some(academicDisciplineNeedsReview)) {
    result.status = "MANUAL_REVIEW_REQUIRED";
    result.warnings.push("A projeção aguarda conferência manual de linhas/campos do extrato.");
  }
  if (disciplines.length === 0 && !extractionWarnings.length) extractionWarnings.push(`Revise os dados extraídos de ${filename}.`);
  return {
    disciplines,
    result,
    studentName,
    rgm,
    courseName,
    extractionWarnings,
    ...(sourceDisciplineCount !== undefined ? { sourceDisciplineCount, sourceParsedDisciplineCount: disciplines.length } : {}),
    manuallyEdited: false,
  };
}

/** Blocks documents that cannot safely support an academic-grid analysis. */
export function validateAcademicTranscript(
  snapshot: AcademicGridSnapshot,
  fullText: string,
): string | null {
  const normalizedText = fold(fullText);
  if (
    normalizedText.includes("SOLICITACAO DE TRANSFERENCIA") &&
    normalizedText.includes("ANALISE CURRICULAR")
  ) {
    return "Este arquivo é uma solicitação ou um resultado de análise curricular, não um extrato escolar. Anexe o extrato atualizado do aluno, com identificação, curso e histórico completo. A análise não foi iniciada.";
  }

  const missing: string[] = [];
  if (!snapshot.studentName?.trim() && !snapshot.rgm?.trim()) missing.push("identificação do aluno (nome ou RGM)");
  if (!snapshot.courseName?.trim()) missing.push("curso");
  if (snapshot.disciplines.filter((discipline) => discipline.inMainCurriculum).length === 0) missing.push("disciplinas e situações acadêmicas");
  if (snapshot.extractionWarnings.some((warning) => warning.startsWith("A conferência automática encontrou"))) {
    missing.push("todas as linhas da grade legíveis");
  }

  if (missing.length === 0) return null;
  return `Não foi possível iniciar a análise: o PDF não apresentou ${missing.join(", ")}. Anexe um extrato escolar atualizado, completo e legível. A análise curricular só começa após a confirmação de que o documento e os dados estão corretos.`;
}
