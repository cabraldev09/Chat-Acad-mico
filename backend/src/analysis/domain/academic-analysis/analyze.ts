import { ACADEMIC_RULES, academicStatusOutcome } from "./rules";
import type { AcademicDiscipline, AcademicGridResult, AcademicReviewStatus } from "./types";
import type { GraduationForecast } from "./graduation-forecast";

export function normalizeAcademicStatus(value: string): string {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[\u00a0\t\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return normalized.replace(/^AE\s*\*$/, "AE*");
}

export function parseAcademicPeriod(raw: string): number | null {
  const value = raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  const match = value.match(/(?:^|\D)(\d{1,2})(?:\s*[ºª°]?\s*(?:PERIODO|PERIOD|SERIE|ETAPA|MODULO)?\b|\s*\/\s*[A-Z])?/i);
  if (!match) return null;
  const period = Number(match[1]);
  return Number.isInteger(period) && period >= 1 && period <= 20 ? period : null;
}

/** Empty tutor-added rows are drafts, not disciplines; ignore them until data is entered. */
export function isBlankManualDisciplineDraft(discipline: AcademicDiscipline): boolean {
  return discipline.sourcePage === 0 &&
    !discipline.name.trim() &&
    !discipline.code?.trim() &&
    discipline.period === null &&
    discipline.workload === null;
}

export function academicDisciplineNeedsReview(discipline: AcademicDiscipline): boolean {
  return discipline.inMainCurriculum && !isBlankManualDisciplineDraft(discipline) && (
    !discipline.name.trim() ||
    discipline.name.startsWith("COMPONENTE NÃO IDENTIFICADO") ||
    discipline.period === null ||
    academicStatusOutcome(discipline.normalizedStatus) === "UNKNOWN"
  );
}

export function academicGridHasUnresolvedRowCount(
  disciplines: AcademicDiscipline[],
  sourceDisciplineCount?: number,
  sourceParsedDisciplineCount?: number,
): boolean {
  if (sourceDisciplineCount === undefined) return false;
  if (sourceParsedDisciplineCount === undefined) return disciplines.length !== sourceDisciplineCount;
  if (sourceParsedDisciplineCount > sourceDisciplineCount) return true;
  const missingFromExtraction = sourceDisciplineCount - sourceParsedDisciplineCount;
  const tutorAddedRows = disciplines.filter((discipline) => discipline.sourcePage === 0 && !isBlankManualDisciplineDraft(discipline)).length;
  return tutorAddedRows < missingFromExtraction;
}

export function unresolvedAcademicGridRowCount(
  disciplines: AcademicDiscipline[],
  sourceDisciplineCount?: number,
  sourceParsedDisciplineCount?: number,
): number {
  if (sourceDisciplineCount === undefined) return 0;
  const parsedCount = sourceParsedDisciplineCount ?? disciplines.length;
  const missingFromExtraction = Math.max(0, sourceDisciplineCount - parsedCount);
  const completedManualRows = disciplines.filter((discipline) => discipline.sourcePage === 0 && !isBlankManualDisciplineDraft(discipline)).length;
  return Math.max(0, missingFromExtraction - completedManualRows);
}

export function analyzeAcademicGrid(input: {
  disciplines: AcademicDiscipline[];
  currentPeriod: number | null;
  currentPeriodConfirmed?: boolean;
}): AcademicGridResult {
  const currentPeriodConfirmed = input.currentPeriodConfirmed ?? input.currentPeriod !== null;
  const period = input.currentPeriod;
  const inGrid = input.disciplines.filter((discipline) => discipline.inMainCurriculum && !isBlankManualDisciplineDraft(discipline));
  const forCurrentPeriod = period === null ? [] : inGrid.filter((discipline) => discipline.period === period);
  const previous = period === null ? [] : inGrid.filter((discipline) => discipline.period !== null && discipline.period < period);
  const pendingDisciplines = previous.filter((discipline) => discipline.normalizedStatus === "A CURSAR");
  const previousCoursesInProgress = previous.filter((discipline) => discipline.normalizedStatus === "CURSANDO");
  const currentPeriodAE = forCurrentPeriod.filter((discipline) => discipline.normalizedStatus === "AE" || discipline.normalizedStatus === "AE*").length;
  const previousPending = pendingDisciplines.length;
  const previousAlreadyAdded = previousCoursesInProgress.length;
  const currentPeriodComponents = forCurrentPeriod.length;
  const baseExtraAllowance = ACADEMIC_RULES.BASE_EXTRA_ALLOWANCE;
  const extraAllowance = baseExtraAllowance + currentPeriodAE * ACADEMIC_RULES.EXTRA_PER_CURRENT_PERIOD_AE;
  const semesterMaximum = currentPeriodComponents + extraAllowance;
  const usedExtraSlots = previousAlreadyAdded;
  const remainingExtraSlots = Math.max(0, extraAllowance - usedExtraSlots);
  const canAddNow = Math.min(previousPending, remainingExtraSlots);
  const pendingByPeriod: Record<string, number> = {};
  for (const discipline of pendingDisciplines) {
    const key = String(discipline.period);
    pendingByPeriod[key] = (pendingByPeriod[key] ?? 0) + 1;
  }
  const warnings: string[] = [];
  const incompleteRows = inGrid.filter(academicDisciplineNeedsReview);
  if (incompleteRows.length) {
    warnings.push(`${incompleteRows.length} componente(s) da grade principal têm nome, período ou situação sem confirmação.`);
  }
  let status: AcademicReviewStatus;
  if (period === null || !currentPeriodConfirmed || currentPeriodComponents === 0) {
    status = "MANUAL_REVIEW_REQUIRED";
    if (period === null || !currentPeriodConfirmed) warnings.push("Confirme o período atual do aluno para continuar.");
    if (currentPeriodComponents === 0) warnings.push("Nenhum componente da grade foi identificado no período atual. Revise a classificação da grade principal.");
  } else if (incompleteRows.length > 0) {
    status = "MANUAL_REVIEW_REQUIRED";
  } else if (usedExtraSlots > extraAllowance) {
    status = "MANUAL_REVIEW_REQUIRED";
    warnings.push("REVISÃO NECESSÁRIA: foram identificadas mais disciplinas anteriores CURSANDO do que vagas adicionais calculadas.");
  } else if (previousPending === 0) {
    status = "NO_PENDING";
  } else if (remainingExtraSlots === 0) {
    status = "LIMIT_REACHED";
  } else if (remainingExtraSlots === 1) {
    status = "NEAR_LIMIT";
  } else {
    status = "CAN_ADD";
  }
  return {
    currentPeriod: period,
    currentPeriodConfirmed,
    currentPeriodComponents,
    previousPending,
    previousAlreadyAdded,
    currentPeriodAE,
    baseExtraAllowance,
    extraAllowance,
    semesterMaximum,
    usedExtraSlots,
    remainingExtraSlots,
    canAddNow,
    pendingAfterPossibleInclusion: previousPending - canAddNow,
    status,
    pendingByPeriod,
    pendingDisciplines,
    previousCoursesInProgress,
    suggestedCourses: [...pendingDisciplines].sort((a, b) => (a.period ?? 99) - (b.period ?? 99) || a.name.localeCompare(b.name, "pt-BR")),
    warnings,
  };
}

/** One source of truth for both the completion button and the server action. */
export function academicGridCompletionBlockers(input: {
  disciplines: AcademicDiscipline[];
  currentPeriod: number | null;
  currentPeriodConfirmed: boolean;
  sourceDisciplineCount?: number;
  sourceParsedDisciplineCount?: number;
}): string[] {
  const blockers: string[] = [];
  if (input.currentPeriod === null || !input.currentPeriodConfirmed) {
    blockers.push("Confirme o período atual do aluno.");
  }
  const incompleteCount = input.disciplines.filter(academicDisciplineNeedsReview).length;
  if (incompleteCount > 0) {
    blockers.push(`Revise o período e a situação de ${incompleteCount} componente(s) da grade.`);
  }
  if (academicGridHasUnresolvedRowCount(input.disciplines, input.sourceDisciplineCount, input.sourceParsedDisciplineCount)) {
    blockers.push("Confira as linhas faltantes do extrato e complete a grade.");
  }
  if (input.currentPeriod !== null && input.currentPeriodConfirmed) {
    const result = analyzeAcademicGrid({ disciplines: input.disciplines, currentPeriod: input.currentPeriod, currentPeriodConfirmed: true });
    if (result.currentPeriodComponents === 0) blockers.push("Nenhuma disciplina da grade foi identificada no período atual.");
    if (result.usedExtraSlots > result.extraAllowance) blockers.push("Há mais disciplinas anteriores em andamento do que vagas adicionais disponíveis.");
  }
  return blockers;
}

export function buildStudentMessage(input: {
  result: AcademicGridResult;
  forecast?: GraduationForecast | null;
  tutorExpectedCompletionTerm?: string | null;
}): string {
  const { result } = input;
  const pendingCount = input.forecast?.knownBacklog ?? result.previousPending;
  const pending = `${pendingCount} disciplina${pendingCount === 1 ? "" : "s"} de períodos anteriores consta${pendingCount === 1 ? "" : "m"} como A CURSAR`;
  const yearsEstimate = input.forecast
    ? input.forecast.yearsMin === input.forecast.yearsMax
      ? `${input.forecast.yearsMin.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} ${input.forecast.yearsMin === 1 ? "ano" : "anos"}`
      : `de ${input.forecast.yearsMin.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} a ${input.forecast.yearsMax.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} anos`
    : null;
  const completionTerms = input.tutorExpectedCompletionTerm
    ? `no período ${input.tutorExpectedCompletionTerm}`
    : input.forecast?.completionTermMin && input.forecast.completionTermMax
    ? input.forecast.completionTermMin === input.forecast.completionTermMax
      ? `no período ${input.forecast.completionTermMin}`
      : `entre os períodos ${input.forecast.completionTermMin} e ${input.forecast.completionTermMax}`
    : null;
  const completionDates = input.forecast?.completionDateMin && input.forecast.completionDateMax
    ? `${formatMonthYear(input.forecast.completionDateMin)}${input.forecast.completionDateMin === input.forecast.completionDateMax ? "" : ` a ${formatMonthYear(input.forecast.completionDateMax)}`}`
    : null;
  const lines = [
    "Resumo da análise do extrato escolar:",
    "",
    result.currentPeriod === null
      ? "• Período atual: precisa ser confirmado com base no extrato."
      : `• Período atual identificado: ${result.currentPeriod}º.`,
    `• Disciplinas pendentes de períodos anteriores: ${pending}.`,
    result.previousAlreadyAdded > 0
      ? `• Em andamento: ${result.previousAlreadyAdded} disciplina${result.previousAlreadyAdded === 1 ? "" : "s"} anterior${result.previousAlreadyAdded === 1 ? "" : "es"}.`
      : null,
    `• Vagas adicionais disponíveis neste período: ${result.remainingExtraSlots}.`,
    input.tutorExpectedCompletionTerm
      ? `• Previsão estimada de conclusão: ${completionTerms}.`
      : input.forecast
        ? completionTerms
          ? `• Previsão estimada de conclusão: ${completionTerms}${completionDates ? ` (${completionDates})` : ""}.`
          : `• Prazo estimado: ${input.forecast.semestersMin === input.forecast.semestersMax ? `${input.forecast.semestersMin} semestre${input.forecast.semestersMin === 1 ? "" : "s"}` : `${input.forecast.semestersMin} a ${input.forecast.semestersMax} semestres`} após o período atual (aproximadamente ${yearsEstimate}).`
        : "• Previsão de conclusão: não calculável com segurança a partir dos dados identificados no extrato.",
    input.forecast || input.tutorExpectedCompletionTerm
      ? "A previsão é uma estimativa e pode mudar conforme aprovação, rematrícula, oferta de disciplinas e pré-requisitos."
      : null,
  ].filter((line): line is string => line !== null);
  return lines.join("\n");
}

function formatMonthYear(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}
