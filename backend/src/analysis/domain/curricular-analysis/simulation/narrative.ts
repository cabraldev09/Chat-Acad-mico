import type { SemesterSimulation } from "../types";
import { parseTerm } from "./terms";
import { formatCalendarDate, getCalendarTerm, type AcademicCalendarTerm } from "../../academic-calendar/calendar";

export interface NarrativeInput {
  semesters: SemesterSimulation[];
  entryPeriod: number;
  /** Pendências de períodos anteriores ao ingresso (backlog inicial). */
  backlogTotal: number;
  /** Menor e maior período com pendência no backlog (para "do 1º ao 7º"). */
  backlogPeriodRange: { from: number; to: number } | null;
  maximumCapacity: number;
  incomplete: boolean;
  remainingBacklog: number;
  periodUnit?: "SEMESTER" | "YEAR";
  calendarTerms?: AcademicCalendarTerm[];
}

export interface ProjectionNarrative {
  headerLines: string[];
  bulletLines: string[];
  conclusionLine: string | null;
  /** Texto completo pronto para WhatsApp (negrito com *asteriscos*). */
  text: string;
}

function adaptationsPhrase(n: number, isLast: boolean): string {
  if (n === 0) return "";
  if (n === 1) return isLast ? " + última adaptação" : " + 1 adaptação";
  return ` + ${n} adaptações`;
}

/** "final de 2028" para X.2 e "meados de 2028" para X.1. */
export function completionPhrase(term: string, periodUnit: "SEMESTER" | "YEAR" = "SEMESTER"): string {
  const t = parseTerm(term);
  if (periodUnit === "YEAR") return `o final de ${t.year}`;
  return t.semester === 2 ? `o final de ${t.year}` : `meados de ${t.year}`;
}

export function completionMonth(term: string, periodUnit: "SEMESTER" | "YEAR" = "SEMESTER"): string {
  const t = parseTerm(term);
  if (periodUnit === "YEAR") return `dezembro de ${t.year}`;
  return t.semester === 2 ? `dezembro de ${t.year}` : `junho de ${t.year}`;
}

/**
 * buildProjectionNarrative — descreve a simulação semestre a semestre no formato usado pela equipe:
 *   • *2026.2:* 4º semestre + algumas adaptações
 *   • *2028.2:* 8º semestre e conclusão
 *   Então, a previsão de formação fica para o *final de 2028*
 */
export function buildProjectionNarrative(input: NarrativeInput): ProjectionNarrative {
  const headerLines: string[] = [];
  headerLines.push(`Ingresso: *${input.entryPeriod}º semestre*`);
  if (input.backlogTotal > 0) {
    const range = input.backlogPeriodRange ? ` (do ${input.backlogPeriodRange.from}º ao ${input.backlogPeriodRange.to}º semestre)` : "";
    headerLines.push(`⚠️ Total de ${input.backlogTotal} matéria(s) a adaptar${range}`);
  }
  headerLines.push(`Semestres previstos: *${input.semesters.length}*`);

  const lastIndex = input.semesters.length - 1;
  const bulletLines = input.semesters.map((s, i) => {
    const isLast = i === lastIndex && !input.incomplete;
    if (s.isAdditional) {
      const label = `semestre adicional c/ ${s.semesterLoad} matéria(s)`;
      return `• *${s.term}:* ${label}${isLast ? " e conclusão" : ""}`;
    }
    const adaptations = adaptationsPhrase(s.subjectsFromBacklog, s.remainingBacklog === 0 && s.subjectsFromBacklog > 0);
    const base = `• *${s.term}:* ${s.periodNumber}º semestre${adaptations}`;
    const load = ` (${s.semesterLoad} matéria${s.semesterLoad === 1 ? "" : "s"})`;
    return `${base}${load}${isLast ? " e conclusão" : ""}`;
  });

  let conclusionLine: string | null = null;
  if (input.incomplete) {
    conclusionLine = `⚠️ Restam ${input.remainingBacklog} matéria(s) sem semestre alocado — a regra de semestre adicional precisa ser confirmada.`;
  } else if (lastIndex >= 0) {
    const term = input.semesters[lastIndex].term;
    const calendarCode = input.periodUnit === "YEAR" && !term.includes(".") ? `${term}.2` : term;
    const calendarTerm = input.calendarTerms ? getCalendarTerm(calendarCode, input.calendarTerms) : null;
    const calendarDate = calendarTerm
      ? `até ${formatCalendarDate(calendarTerm.endsOn)} — ${calendarTerm.term}, calendário ${calendarTerm.confidence === "OFFICIAL" ? "oficial" : "projetado"}`
      : `${completionMonth(term, input.periodUnit)} — ${term}`;
    conclusionLine = `Então, a previsão de formação fica para *${completionPhrase(term, input.periodUnit)}* (${calendarDate}).`;
  }

  const text = [...headerLines, "", "A previsão fica assim:", "", ...bulletLines, "", conclusionLine ?? ""].join("\n").trim();
  return { headerLines, bulletLines, conclusionLine, text };
}
