import { simulateCurriculum } from "../curricular-analysis/simulation/simulate";
import type { SubjectRow } from "../curricular-analysis/types";
import type { AcademicRules } from "../curricular-analysis/rules/types";
import { DEFAULT_RULES } from "../curricular-analysis/rules/types";
import { academicStatusOutcome } from "./rules";
import { analyzeAcademicGrid, isBlankManualDisciplineDraft, unresolvedAcademicGridRowCount } from "./analyze";
import { academicTermAtDate, advanceAcademicTerm, getCalendarTerm, type AcademicCalendarTerm } from "../academic-calendar/calendar";
import type { AcademicDiscipline } from "./types";

export interface GraduationPlanStep {
  curriculumPeriod: number;
  adaptationSemesterNumber: number | null;
  term: string | null;
  isAdditional: boolean;
  curriculumSubjects: number;
  exemptions: number;
  regularSubjects: number;
  bonusSlots: number;
  capacity: number;
  previousSubjects: string[];
  regularSubjectNames: string[];
  inProgressSubjectNames: string[];
  inProgressFromPrevious: number;
  totalLoad: number;
  remainingBacklog: number;
}

export interface GraduationForecast {
  semestersMin: number;
  semestersMax: number;
  yearsMin: number;
  yearsMax: number;
  remainingPeriods: number;
  knownBacklog: number;
  uncertainRows: number;
  futureBacklogSlots: number;
  currentCalendarTerm: string | null;
  completionTermMin: string | null;
  completionTermMax: string | null;
  completionDateMin: string | null;
  completionDateMax: string | null;
  calendarConfidence: "OFFICIAL" | "ESTIMATED" | null;
  plan: GraduationPlanStep[];
  incomplete: boolean;
  reasons: string[];
}

export function isGraduationRowUncertain(discipline: AcademicDiscipline): boolean {
  return !isBlankManualDisciplineDraft(discipline) && (discipline.period === null || academicStatusOutcome(discipline.normalizedStatus) === "UNKNOWN");
}

/** Title ellipses do not change row count or status; other warnings mark the automatic estimate as partial. */
export function isBlockingForecastExtractionWarning(warning: string): boolean {
  return !/(?:título.*(?:reticências|truncad)|reticências.*título)/i.test(warning);
}

function toEngineStatus(discipline: AcademicDiscipline, currentPeriod: number): SubjectRow["status"] {
  const outcome = academicStatusOutcome(discipline.normalizedStatus);
  // O período atual e suas disciplinas CURSANDO entram na simulação corrente;
  // aprovação é a premissa projetada, mas reprovações já registradas continuam pendentes.
  if (outcome === "UNKNOWN") return "REVIEW";
  if (discipline.period === currentPeriod && (outcome === "IN_PROGRESS" || outcome === "PENDING")) return "PENDING";
  if (discipline.period === currentPeriod) return "EXEMPTED";
  if (outcome === "PENDING") return "PENDING";
  if (outcome === "COMPLETED" || outcome === "EXEMPT" || (outcome === "IN_PROGRESS" && discipline.period !== null && discipline.period < currentPeriod)) return "EXEMPTED";
  if (outcome === "IN_PROGRESS") return "PENDING";
  return "REVIEW";
}

/**
 * Adapts SIAA rows into the exact deterministic simulator used by curricular
 * analyses. It simulates the current term first and shifts previous-period
 * CURSANDO subjects into that term so they consume seats without being counted
 * again as future backlog.
 */
export function estimateGraduation(input: {
  disciplines: AcademicDiscipline[];
  currentPeriod: number | null;
  analysisDate?: string;
  calendarTerms?: AcademicCalendarTerm[];
  rules?: AcademicRules;
  additionalSemesterCapacityRule?: "SAME_AS_LAST_PERIOD" | { type: "FIXED_VALUE"; value: number } | "UNCONFIGURED";
  maximumSubjectsPerSemester?: number | null;
  extractionWarnings?: string[];
  sourceDisciplineCount?: number;
  sourceParsedDisciplineCount?: number;
}): GraduationForecast | null {
  const grid = input.disciplines.filter((discipline) => discipline.inMainCurriculum && !isBlankManualDisciplineDraft(discipline));
  const validPeriods = grid.flatMap((discipline) => discipline.period === null ? [] : [discipline.period]);
  if (input.currentPeriod === null || validPeriods.length === 0) return null;

  const currentPeriod = input.currentPeriod;
  const gradeLastPeriod = Math.max(...validPeriods);
  const uncertainFieldRows = grid.filter(isGraduationRowUncertain).length;
  const unresolvedSourceRows = unresolvedAcademicGridRowCount(input.disciplines, input.sourceDisciplineCount, input.sourceParsedDisciplineCount);
  const uncertainRows = uncertainFieldRows + unresolvedSourceRows;
  const reasons: string[] = [];
  if (uncertainFieldRows) reasons.push(`${uncertainFieldRows} componente(s) com período ou situação acadêmica não identificada com segurança.`);
  if (unresolvedSourceRows) reasons.push(`${unresolvedSourceRows} linha(s) do extrato não foram identificadas na grade; a estimativa inclui uma margem automática.`);
  if (currentPeriod > gradeLastPeriod) reasons.push("O período atual confirmado está além do último período identificado na grade; revise a grade antes de projetar a conclusão.");
  const blockingExtractionWarnings = (input.extractionWarnings ?? []).filter(isBlockingForecastExtractionWarning);
  for (const warning of blockingExtractionWarnings) {
    reasons.push(`Conferência da extração necessária: ${warning}`);
  }

  const subjects: SubjectRow[] = grid.flatMap((discipline, sortIndex) => {
    if (discipline.period === null) return [];
    return [{
      id: `academic-${sortIndex}`,
      name: discipline.name,
      workload: discipline.workload ?? 0,
      period: discipline.period,
      usedSubject: null,
      status: toEngineStatus(discipline, currentPeriod),
      readability: academicStatusOutcome(discipline.normalizedStatus) === "UNKNOWN" ? "UNCLEAR" : "CLEAR",
      sourcePage: discipline.sourcePage,
      sourceRow: discipline.sourceRow,
      sortIndex,
    }];
  });
  const knownBacklog = subjects.filter((subject) => subject.period < currentPeriod && subject.status === "PENDING").length;
  const hasPreviousWorkToSchedule = subjects.some((subject) =>
    subject.period < currentPeriod && (subject.status === "PENDING" || subject.status === "REVIEW"),
  );
  // Períodos posteriores compostos somente por dispensas não são semestres
  // que o aluno precise cursar. Mantemos esses períodos quando há pendências
  // antigas para alocar, pois as dispensas podem liberar vagas de adaptação.
  const lastRequiredPeriod = hasPreviousWorkToSchedule
    ? gradeLastPeriod
    : Math.max(
      currentPeriod,
      ...subjects
        .filter((subject) => subject.period >= currentPeriod && (subject.status === "PENDING" || subject.status === "REVIEW"))
        .map((subject) => subject.period),
    );
  const subjectsForSimulation = subjects.filter((subject) => subject.period <= lastRequiredPeriod);
  // Novas análises sempre recebem analysisDate; callers auxiliares usam a data
  // institucional atual em vez de congelar previsões no semestre de 2026.2.
  const referenceDate = input.analysisDate ?? currentInstitutionDate();
  const currentCalendarTerm = input.calendarTerms
    ? academicTermAtDate(referenceDate, input.calendarTerms)
    : null;
  const inferredCurrentTerm = `${referenceDate.slice(0, 4)}.${Number(referenceDate.slice(5, 7)) <= 6 ? "1" : "2"}`;
  const rulesBase = input.rules ?? DEFAULT_RULES;
  const rules: AcademicRules = {
    ...rulesBase,
    maximumSubjectsPerSemester: input.maximumSubjectsPerSemester === undefined ? rulesBase.maximumSubjectsPerSemester : input.maximumSubjectsPerSemester,
    additionalSemesterCapacityRule: input.additionalSemesterCapacityRule === undefined
      ? rulesBase.additionalSemesterCapacityRule
      : input.additionalSemesterCapacityRule === "UNCONFIGURED"
        ? { type: "UNCONFIGURED" }
        : typeof input.additionalSemesterCapacityRule === "string"
          ? { type: input.additionalSemesterCapacityRule }
          : input.additionalSemesterCapacityRule,
  };
  const currentTerm = currentCalendarTerm?.term ?? inferredCurrentTerm;
  const startTerm = rules.periodUnit === "YEAR" ? currentTerm.slice(0, 4) : currentTerm;
  const priorInProgressIds = new Set(grid.flatMap((discipline, sortIndex) =>
    discipline.period !== null && discipline.period < currentPeriod && academicStatusOutcome(discipline.normalizedStatus) === "IN_PROGRESS"
      ? [`academic-${sortIndex}`]
      : [],
  ));
  const currentGrid = analyzeAcademicGrid({ disciplines: grid, currentPeriod, currentPeriodConfirmed: true });
  const projectionRules: AcademicRules = {
    ...rules,
    // If no institutional total ceiling is configured, carry forward the
    // current term's calculated maximum as the candidate's projection ceiling.
    maximumSubjectsPerSemester: rules.maximumSubjectsPerSemester ?? (
      currentGrid.currentPeriodComponents > 0 ? currentGrid.semesterMaximum : null
    ),
  };
  const backlogCapacityOverrideByPeriod = currentGrid.currentPeriodComponents > 0 || currentGrid.previousAlreadyAdded > 0
    ? { [currentPeriod]: currentGrid.remainingExtraSlots }
    : undefined;
  // The academic rules give one additional adaptation slot for each AE/AE*
  // in that curriculum period, beyond the regular +3 capacity.
  // Aggregate the one-for-one AE bonus by period.
  const aeCapacityBonusByPeriod = grid.reduce<Record<number, number>>((bonusByPeriod, discipline) => {
    if (discipline.period !== null && (discipline.normalizedStatus === "AE" || discipline.normalizedStatus === "AE*")) {
      bonusByPeriod[discipline.period] = (bonusByPeriod[discipline.period] ?? 0) + 1;
    }
    return bonusByPeriod;
  }, {});
  const simulation = simulateCurriculum({
    subjects: subjectsForSimulation,
    entryPeriod: currentPeriod,
    startTerm,
    rules: projectionRules,
    alreadyInProgressSubjectIds: [...priorInProgressIds],
    additionalCapacityBonusByPeriod: aeCapacityBonusByPeriod,
    backlogCapacityOverrideByPeriod,
    skipUnneededExemptionPeriods: true,
  });
  if (simulation.incomplete) {
    reasons.push(simulation.incompleteReason === "MAX_ADDITIONAL_SEMESTERS"
      ? "O limite configurado de semestres adicionais foi atingido antes de zerar as pendências."
      : "Há pendências após o último período e a capacidade do semestre adicional não está configurada.");
  }
  if (grid.some((discipline) => discipline.period !== null && discipline.period > currentPeriod && academicStatusOutcome(discipline.normalizedStatus) === "IN_PROGRESS")) {
    reasons.push("Há disciplina futura marcada como CURSANDO; ela foi incluída como pendência para não desaparecer da projeção.");
  }

  const namesById = new Map(subjectsForSimulation.map((subject) => [subject.id, subject.name]));
  let nextAdditionalPeriod = gradeLastPeriod + 1;
  let adaptationSemesterNumber = 1;
  const steps: GraduationPlanStep[] = simulation.semesters.map((step) => {
    const previousSubjects = step.backlogSubjectIds.map((id) => namesById.get(id) ?? id);
    return {
      curriculumPeriod: step.periodNumber ?? nextAdditionalPeriod++,
      adaptationSemesterNumber: step.isAdditional ? adaptationSemesterNumber++ : null,
      term: step.term || null,
      isAdditional: step.isAdditional,
      curriculumSubjects: step.subjectsInPeriod,
      exemptions: step.exemptedInPeriod,
      regularSubjects: step.regularSubjectIds.length,
      regularSubjectNames: step.regularSubjectIds.map((id) => namesById.get(id) ?? id),
      bonusSlots: step.backlogCapacity,
      capacity: step.maximumCapacity,
      previousSubjects,
      inProgressSubjectNames: (step.alreadyInProgressSubjectIds ?? []).map((id) => namesById.get(id) ?? id),
      inProgressFromPrevious: step.alreadyInProgressSubjectIds?.length ?? 0,
      totalLoad: step.semesterLoad,
      remainingBacklog: step.remainingBacklog,
    };
  });
  // REVIEW is deliberately simulated as pending by the shared rules, but remains
  // visible as uncertainty instead of being silently approved by this adapter.
  if (subjects.some((subject) => subject.status === "REVIEW") && !reasons.some((reason) => reason.includes("situação acadêmica"))) {
    reasons.push("Situação não reconhecida: o motor aplicou a configuração de REVISAR como pendente.");
  }

  // Keep a best-effort window available without waiting for tutor input. When
  // the source has uncertain rows, widen the upper bound by their capacity.
  const uncertaintySemesterBuffer = uncertainRows
    ? Math.ceil(uncertainRows / Math.max(1, simulation.semesters.at(-1)?.backlogCapacity ?? 1))
    : 0;
  const completionTermMin = simulation.estimatedCompletionTerm;
  const completionTermMax = completionTermMin
    ? advanceForecastTerm(completionTermMin, uncertaintySemesterBuffer, rules.periodUnit)
    : null;
  const completionCalendarMin = completionTermMin && input.calendarTerms
    ? getCalendarTerm(calendarTermCode(completionTermMin), input.calendarTerms)
    : null;
  const completionCalendarMax = completionTermMax && input.calendarTerms
    ? getCalendarTerm(calendarTermCode(completionTermMax), input.calendarTerms)
    : null;
  const semesters = simulation.semestersRemaining;
  const unitCount = rules.periodUnit === "YEAR" ? 1 : 2;
  return {
    semestersMin: semesters,
    semestersMax: semesters + uncertaintySemesterBuffer,
    yearsMin: semesters / unitCount,
    yearsMax: (semesters + uncertaintySemesterBuffer) / unitCount,
    remainingPeriods: Math.max(0, lastRequiredPeriod - currentPeriod),
    knownBacklog,
    uncertainRows,
    futureBacklogSlots: simulation.semesters.reduce((sum, step) => sum + step.backlogCapacity, 0),
    currentCalendarTerm: currentCalendarTerm?.term ?? currentTerm,
    completionTermMin,
    completionTermMax,
    completionDateMin: completionCalendarMin?.endsOn ?? null,
    completionDateMax: completionCalendarMax?.endsOn ?? null,
    calendarConfidence: completionCalendarMin?.confidence === "OFFICIAL" && completionCalendarMax?.confidence === "OFFICIAL"
      ? "OFFICIAL"
      : completionCalendarMin || completionCalendarMax
        ? "ESTIMATED"
        : null,
    plan: steps,
    incomplete: reasons.length > 0,
    reasons,
  };
}

function advanceForecastTerm(term: string, count: number, periodUnit: "SEMESTER" | "YEAR"): string {
  if (count === 0) return term;
  if (periodUnit === "YEAR" && /^\d{4}$/.test(term)) return String(Number(term) + count);
  return advanceAcademicTerm(term, count);
}

function calendarTermCode(term: string): string {
  return /^\d{4}$/.test(term) ? `${term}.2` : term;
}

function currentInstitutionDate(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Porto_Velho",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "01";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function formatYears(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}

export function formatGraduationForecast(forecast: GraduationForecast): { semesters: string; years: string; completion: string; calendarLabel: string } {
  const completionTerm = forecast.completionTermMin && forecast.completionTermMax
    ? forecast.completionTermMin === forecast.completionTermMax
      ? forecast.completionTermMin
      : `${forecast.completionTermMin}–${forecast.completionTermMax}`
    : "";
  const completionDates = forecast.completionDateMin && forecast.completionDateMax
    ? `${monthYear(forecast.completionDateMin)}${forecast.completionDateMin === forecast.completionDateMax ? "" : ` a ${monthYear(forecast.completionDateMax)}`}`
    : "";
  return {
    semesters: forecast.semestersMin === forecast.semestersMax
      ? `${forecast.semestersMin} semestre${forecast.semestersMin === 1 ? "" : "s"}`
      : `${forecast.semestersMin}–${forecast.semestersMax} semestres`,
    years: forecast.yearsMin === forecast.yearsMax
      ? `${formatYears(forecast.yearsMin)} ano${forecast.yearsMin === 1 ? "" : "s"}`
      : `${formatYears(forecast.yearsMin)}–${formatYears(forecast.yearsMax)} anos`,
    completion: completionTerm ? `${completionTerm}${completionDates ? ` · ${completionDates}` : ""}` : "",
    calendarLabel: forecast.calendarConfidence === "OFFICIAL" ? "datas oficiais" : forecast.calendarConfidence === "ESTIMATED" ? "datas projetadas" : "calendário não identificado",
  };
}

function monthYear(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}
