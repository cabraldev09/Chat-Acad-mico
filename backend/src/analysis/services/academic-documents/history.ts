import type {
  AcademicDiscipline,
  AcademicGridSnapshot,
} from "../../domain/academic-analysis/types";
import { academicStatusOutcome } from "../../domain/academic-analysis/rules";
import { analyzeAcademicGrid } from "../../domain/academic-analysis/analyze";
import { enrollmentFromText } from "../../domain/academic-analysis/enrollment";
import {
  applyHistoryPeriodInference,
  inferPeriodsByTerm,
  latestAcademicTerm,
  HISTORY_TERM_SOURCE,
} from "../../domain/academic-analysis/history-period-inference";
import type { LocalExtraction, ParsedPage, TextLine } from "../pdf/parser";
import { foldDocument, type AcademicDocumentType } from "./classifier";

/** History table rows span many visual lines; academicTerm is never a curricular period. */
export function extractAcademicHistory(
  local: LocalExtraction,
  type: AcademicDocumentType,
  previous?: AcademicGridSnapshot | null,
): AcademicGridSnapshot {
  const text = local.textByPage.join("\n");
  // the digital history prints the label on one line and the value right below it, in the same column
  const below = (label: string): string | null => {
    for (const page of local.pages)
      for (const line of page.lines)
        for (const part of line.parts) {
          if (foldDocument(part.text) !== label) continue;
          const value = page.lines
            .filter((l) => l.y < line.y && l.y > line.y - 18)
            .sort((a, b) => b.y - a.y)
            .flatMap((l) => l.parts)
            .find((p) => Math.abs(p.x - part.x) <= 3 && p.text.trim());
          if (value) return value.text.trim();
        }
    return null;
  };
  const rgm =
    text.match(/\bRGM\s*:\s*([\d.-]+)/i)?.[1] ??
    below("RGM")?.match(/^[\d.-]+$/)?.[0] ??
    null;
  const studentName =
    text.match(/\bNome\s*:\s*([^\n\t]+)/i)?.[1]?.trim() ?? below("NOME");
  const courseName =
    text.match(/\bCurso\s*:\s*([^\n\t]+)/i)?.[1]?.trim() ?? below("CURSO");
  const hoursOf = (value: string) =>
    Number(value.replace(/\./g, "").replace(",", "."));
  const workload = (label: string) => {
    // label alone in its cell (digital history): only the value right below it, written as "3000 horas". Read as running
    // text, the two labels come before the two values, and the footer "Temas Transversais" repeats them with other numbers.
    const value = foldDocument(below(`CARGA HORARIA ${label}`) ?? "").match(
      /^([\d.,]+)\s*(?:HORAS|H)$/,
    );
    if (value) return hoursOf(value[1]);
    const found = foldDocument(text).match(
      new RegExp(
        `CARGA HORARIA ${label}\\s*:?\\s*([\\d.,]+)\\s*(?:HORAS|H\\b)`,
      ),
    );
    return found ? hoursOf(found[1]) : null;
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
  const seen = new Set<string>();
  const addRow = (raw: {
    code: string;
    name: string;
    term: string | null;
    grade: string;
    situation: string;
    hours: string;
    page: number;
  }) => {
    const code = raw.code;
    const old = ambiguous.has(code) ? undefined : oldRows.get(code);
    const term = raw.term;
    const grade = raw.grade.replace(/\*{2,}/g, "").replace(/^-+$/, "").trim() || null;
    const situation = foldDocument(raw.situation);
    const hourMatch = raw.hours.match(/^\d+(?:[.,]\d+)?/);
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
    if (digital) {
      // the digital history may print the same subject twice in a term
      const key = `${code}|${term}|${situation}|${grade}`;
      if (seen.has(key)) return;
      seen.add(key);
    }
    expectedCount++;
    disciplines.push({
      code,
      name: old?.name ?? raw.name,
      rawPeriod: old?.rawPeriod ?? "",
      period: old?.period ?? null,
      academicTerm: term,
      grade,
      originalStatus: situation,
      normalizedStatus: status,
      workload: hours ?? old?.workload ?? null,
      inMainCurriculum: old?.inMainCurriculum ?? true,
      sourcePage: raw.page,
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
  };
  let digital = false;
  let digitalTerm: string | null = null;
  for (const page of local.pages) {
    const lines = [...page.lines].sort((a, b) => b.y - a.y);
    const digitalHeader = digitalHeaderOf(lines);
    if (digitalHeader) {
      digital = true;
      digitalTerm = readDigitalPage(page, lines, digitalHeader, digitalTerm, addRow);
      continue;
    }
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
      addRow({
        code: match[1],
        name: match[2],
        term: cell(termX!, hoursX!).match(/\b\d{4}\/[12]\b/)?.[0] ?? null,
        grade: cell(gradeX!, statusX!),
        situation: cell(statusX!, teacherX!),
        hours: cell(hoursX!, gradeX!),
        page: page.page,
      });
    }
  }
  if (digital) {
    // "Pendente" in the latest term printed is a subject the student is enrolled in now
    const latest = latestAcademicTerm(disciplines);
    for (const row of disciplines)
      if (
        latest &&
        row.academicTerm === latest &&
        row.normalizedStatus === "A CURSAR" &&
        /PENDENTE/.test(row.originalStatus)
      )
        row.normalizedStatus = "CURSANDO";
  }
  const recoveredCount = disciplines.length;
  let currentPeriod = previous?.result.currentPeriod ?? null;
  let currentPeriodConfirmed = previous?.result.currentPeriodConfirmed ?? false;
  let periodSuggestion = previous?.periodSuggestion ?? null;
  const base = {
    disciplines,
    result: analyzeAcademicGrid({ disciplines, currentPeriod, currentPeriodConfirmed }),
    studentName,
    rgm,
    courseName,
    extractionWarnings: [],
    manuallyEdited: false,
  };
  // the digital history groups by term and lists what is still to come in one block: the order alone says nothing there
  const mapped = digital
    ? applyHistoryPeriodInference(base, inferPeriodsByTerm(disciplines), { source: HISTORY_TERM_SOURCE, confirmed: false })
    : applyHistoryPeriodInference(base);
  if (mapped.applied) {
    disciplines.splice(0, disciplines.length, ...mapped.snapshot.disciplines);
    currentPeriod = mapped.snapshot.result.currentPeriod;
    currentPeriodConfirmed = mapped.snapshot.result.currentPeriodConfirmed;
    periodSuggestion = mapped.snapshot.periodSuggestion ?? periodSuggestion;
    if (!currentPeriodConfirmed && periodSuggestion?.inferred != null) warnings.push(periodSuggestion.note);
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
    periodSuggestion,
    // what the document says wins; otherwise what the team informed before stays
    enrollmentSituation: enrollmentFromText(text) ?? previous?.enrollmentSituation ?? null,
    sourceDisciplineCount: expectedCount,
    sourceParsedDisciplineCount: recoveredCount,
    extractionWarnings: warnings,
    manuallyEdited: false,
  };
}

const TABLE_END = /Atividades Complementares|Legendas?|Dados Complementares/i;

interface DigitalHeader {
  y: number;
  nameX: number;
  hoursX: number;
  gradeX: number;
  statusX: number;
}

/** Header of the digital history: Código, Disciplina, Carga horária, Média, Situação (the teacher goes under the name). */
function digitalHeaderOf(lines: TextLine[]): DigitalHeader | null {
  for (const line of lines) {
    const x = (pattern: RegExp) =>
      line.parts.find((p) => pattern.test(foldDocument(p.text)))?.x;
    const codeX = x(/^CODIGO$/),
      nameX = x(/^DISCIPLINA$/),
      hoursX = x(/^CARGA HORARIA$/),
      gradeX = x(/^MEDIA$/),
      statusX = x(/^SITUACAO$/);
    if (
      codeX !== undefined &&
      nameX !== undefined &&
      hoursX !== undefined &&
      gradeX !== undefined &&
      statusX !== undefined
    )
      return { y: line.y, nameX, hoursX, gradeX, statusX };
  }
  return null;
}

/** Reads one page of the digital history and returns the term that stays open for the next page. */
function readDigitalPage(
  page: ParsedPage,
  lines: TextLine[],
  header: DigitalHeader,
  openTerm: string | null,
  addRow: (row: { code: string; name: string; term: string | null; grade: string; situation: string; hours: string; page: number }) => void,
): string | null {
  let term = openTerm;
  const endY = Math.max(
    -1,
    ...lines.filter((l) => l.y < header.y && TABLE_END.test(l.text) && l.x < header.nameX - 6).map((l) => l.y),
  );
  const body = lines.filter((l) => l.y < header.y && l.y > endY);
  const split = (header.gradeX + header.statusX) / 2;
  const join = (parts: TextLine["parts"]) => parts.map((p) => p.text.trim()).join(" ").replace(/\s+/g, " ").trim();
  for (let i = 0; i < body.length; i++) {
    const line = body[i];
    const termLine = foldDocument(line.text).match(/^PERIODO LETIVO\s+(\d{4}\/[12]|\*+)/);
    if (termLine) {
      term = /^\d/.test(termLine[1]) ? termLine[1] : null;
      continue;
    }
    const code = line.parts.find((p) => p.x < header.nameX - 6 && /^\d+$/.test(p.text.trim()));
    if (!code) continue;
    const nameParts = line.parts.filter((p) => p.x >= header.nameX - 6 && p.x < header.hoursX - 6);
    const names = [join(nameParts)];
    // the name may wrap; the smaller line under it is the teacher
    for (let j = i + 1; j < body.length; j++) {
      const next = body[j];
      const first = next.parts[0];
      if (!first || Math.abs(first.x - header.nameX) > 3 || next.parts.length > 1) break;
      if (next.h < line.h - 0.5 || /·|^N[aã]o Informado$/i.test(next.text.trim())) break;
      names.push(next.text.trim());
    }
    addRow({
      code: code.text.trim(),
      // "Anos 60-" + "80": a line broken at a hyphen is one word
      name: names.join(" ").replace(/(\d-) (?=\d)/g, "$1").replace(/\s+/g, " ").trim(),
      term,
      hours: join(line.parts.filter((p) => p.x >= header.hoursX - 6 && p.x < header.gradeX - 6)),
      grade: join(line.parts.filter((p) => p.x >= header.gradeX - 6 && p.x < split)),
      situation: join(line.parts.filter((p) => p.x >= split)),
      page: page.page,
    });
  }
  return term;
}
