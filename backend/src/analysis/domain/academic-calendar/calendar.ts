import { formatTerm, nextTerm, parseTerm } from "../curricular-analysis/simulation/terms";

export type CalendarConfidence = "OFFICIAL" | "ESTIMATED";

export interface AcademicCalendarTerm {
  term: string;
  startsOn: string;
  endsOn: string;
  confidence: CalendarConfidence;
  basisYear: number;
  source: string | null;
}

export interface AcademicCalendarConfig {
  version: 1;
  terms: AcademicCalendarTerm[];
}

export const CALENDAR_2026_SOURCE = "CALENDÁRIO ACADÊMICO GRADUAÇÃO EAD - 2026.pdf";

export const DEFAULT_ACADEMIC_CALENDAR: AcademicCalendarConfig = {
  version: 1,
  terms: [
    { term: "2026.1", startsOn: "2026-01-26", endsOn: "2026-06-30", confidence: "OFFICIAL", basisYear: 2026, source: CALENDAR_2026_SOURCE },
    { term: "2026.2", startsOn: "2026-08-03", endsOn: "2026-12-19", confidence: "OFFICIAL", basisYear: 2026, source: CALENDAR_2026_SOURCE },
  ],
};

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function isValidAcademicCalendarTerm(value: unknown): value is AcademicCalendarTerm {
  if (!value || typeof value !== "object") return false;
  const term = value as Partial<AcademicCalendarTerm>;
  try {
    const parsed = parseTerm(term.term ?? "");
    return Boolean(
      parsed.semester &&
      validDate(term.startsOn ?? "") &&
      validDate(term.endsOn ?? "") &&
      (term.startsOn ?? "") < (term.endsOn ?? "") &&
      (term.confidence === "OFFICIAL" || term.confidence === "ESTIMATED") &&
      typeof term.basisYear === "number" &&
      Number.isInteger(term.basisYear) &&
      (term.confidence === "OFFICIAL" ? term.basisYear === parsed.year : term.basisYear <= parsed.year) &&
      typeof term.source !== "undefined" &&
      (term.source === null || typeof term.source === "string") &&
      (term.confidence !== "OFFICIAL" || (typeof term.source === "string" && term.source.trim().length > 0)),
    );
  } catch {
    return false;
  }
}

export function parseAcademicCalendarConfig(value: unknown): AcademicCalendarConfig {
  if (!value || typeof value !== "object") return DEFAULT_ACADEMIC_CALENDAR;
  const candidate = value as Partial<AcademicCalendarConfig>;
  if (candidate.version !== 1 || !Array.isArray(candidate.terms)) return DEFAULT_ACADEMIC_CALENDAR;
  if (!candidate.terms.every(isValidAcademicCalendarTerm)) return DEFAULT_ACADEMIC_CALENDAR;
  const terms = [...candidate.terms].sort((a, b) => a.term.localeCompare(b.term));
  if (new Set(terms.map((item) => item.term)).size !== terms.length) return DEFAULT_ACADEMIC_CALENDAR;
  for (let index = 0; index < terms.length; index++) {
    const current = terms[index];
    const year = current.term.slice(0, 4);
    if (!current.startsOn.startsWith(year) || !current.endsOn.startsWith(year)) return DEFAULT_ACADEMIC_CALENDAR;
    const previous = terms[index - 1];
    if (previous && previous.endsOn >= current.startsOn) return DEFAULT_ACADEMIC_CALENDAR;
  }
  const years = new Set(terms.map((term) => term.term.slice(0, 4)));
  for (const year of years) {
    if (!terms.some((term) => term.term === `${year}.1`) || !terms.some((term) => term.term === `${year}.2`)) return DEFAULT_ACADEMIC_CALENDAR;
  }
  return { version: 1, terms };
}

function yearOf(term: string): number {
  return parseTerm(term).year;
}

function withYear(date: string, year: number): string {
  return `${year}${date.slice(4)}`;
}

/** Builds a rolling calendar. Missing future years inherit month/day from the latest official year and remain explicitly estimated. */
export function buildAcademicCalendar(config: AcademicCalendarConfig, throughYear: number): AcademicCalendarTerm[] {
  const terms = [...config.terms];
  const firstYear = Math.min(2026, ...terms.map((item) => yearOf(item.term)));
  const lastYear = Math.max(throughYear, ...terms.map((item) => yearOf(item.term)));

  for (let year = firstYear; year <= lastYear; year++) {
    for (const semester of [1, 2] as const) {
      const term = formatTerm({ year, semester });
      if (terms.some((item) => item.term === term)) continue;
      const basis = terms
        .filter((item) => parseTerm(item.term).semester === semester && yearOf(item.term) < year && item.confidence === "OFFICIAL")
        .sort((a, b) => yearOf(b.term) - yearOf(a.term))[0]
        ?? DEFAULT_ACADEMIC_CALENDAR.terms.find((item) => parseTerm(item.term).semester === semester)!;
      terms.push({
        term,
        startsOn: withYear(basis.startsOn, year),
        endsOn: withYear(basis.endsOn, year),
        confidence: "ESTIMATED",
        basisYear: yearOf(basis.term),
        source: null,
      });
    }
  }
  return terms.sort((a, b) => a.term.localeCompare(b.term));
}

export function academicTermAtDate(date: string, terms: AcademicCalendarTerm[]): AcademicCalendarTerm | null {
  const ordered = [...terms].sort((a, b) => a.startsOn.localeCompare(b.startsOn));
  const active = ordered.find((term) => term.startsOn <= date && date <= term.endsOn);
  if (active) return active;
  return ordered.find((term) => term.startsOn > date) ?? null;
}

export function advanceAcademicTerm(startTerm: string, count: number): string {
  let term = parseTerm(startTerm);
  for (let index = 0; index < count; index++) term = nextTerm(term);
  return formatTerm(term);
}

export function getCalendarTerm(termCode: string, terms: AcademicCalendarTerm[]): AcademicCalendarTerm | null {
  return terms.find((term) => term.term === termCode) ?? null;
}

export function suggestNextAcademicTerm(date: string, terms: AcademicCalendarTerm[]): AcademicCalendarTerm | null {
  return [...terms]
    .filter((term) => term.startsOn > date)
    .sort((a, b) => a.startsOn.localeCompare(b.startsOn))[0] ?? null;
}

/** Keeps an administrator's default while it is still an active/upcoming term; otherwise follows the calendar. */
export function resolveDefaultAcademicTerm(configuredTerm: string | null, date: string, terms: AcademicCalendarTerm[]): string | null {
  if (configuredTerm) {
    const configured = getCalendarTerm(configuredTerm, terms);
    if (configured && configured.endsOn >= date) return configured.term;
  }
  return suggestNextAcademicTerm(date, terms)?.term ?? null;
}

export function formatCalendarDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}
