import { describe, expect, it } from "vitest";
import {
  academicTermAtDate,
  advanceAcademicTerm,
  buildAcademicCalendar,
  DEFAULT_ACADEMIC_CALENDAR,
  formatCalendarDate,
  parseAcademicCalendarConfig,
  resolveDefaultAcademicTerm,
} from "@/domain/academic-calendar/calendar";

describe("academic calendar", () => {
  it("keeps the provided 2026 dates official and projects future years explicitly", () => {
    const terms = buildAcademicCalendar(DEFAULT_ACADEMIC_CALENDAR, 2028);
    expect(terms.find((term) => term.term === "2026.1")).toMatchObject({ startsOn: "2026-01-26", endsOn: "2026-06-30", confidence: "OFFICIAL" });
    expect(terms.find((term) => term.term === "2026.2")).toMatchObject({ startsOn: "2026-08-03", endsOn: "2026-12-19", confidence: "OFFICIAL" });
    expect(terms.find((term) => term.term === "2027.1")).toMatchObject({ startsOn: "2027-01-26", endsOn: "2027-06-30", confidence: "ESTIMATED", basisYear: 2026 });
    expect(terms).toHaveLength(6);
  });

  it("maps active dates to terms and chooses the next term during calendar gaps", () => {
    const terms = buildAcademicCalendar(DEFAULT_ACADEMIC_CALENDAR, 2027);
    expect(academicTermAtDate("2026-04-01", terms)?.term).toBe("2026.1");
    expect(academicTermAtDate("2026-07-15", terms)?.term).toBe("2026.2");
    expect(academicTermAtDate("2025-12-31", terms)?.term).toBe("2026.1");
  });

  it("advances completion terms across years and formats calendar dates without timezone shifts", () => {
    expect(advanceAcademicTerm("2026.2", 5)).toBe("2029.1");
    expect(formatCalendarDate("2026-01-26")).toBe("26 de janeiro de 2026");
  });

  it("keeps a configured active term but automatically advances a stale default", () => {
    const terms = buildAcademicCalendar(DEFAULT_ACADEMIC_CALENDAR, 2030);
    expect(resolveDefaultAcademicTerm("2027.1", "2026-09-24", terms)).toBe("2027.1");
    expect(resolveDefaultAcademicTerm("2027.1", "2027-07-01", terms)).toBe("2027.2");
    expect(resolveDefaultAcademicTerm(null, "2027-07-01", terms)).toBe("2027.2");
  });

  it("falls back to trusted defaults when saved configuration is malformed", () => {
    expect(parseAcademicCalendarConfig({ version: 1, terms: [{ term: "2026.1", startsOn: "2026-02-31" }] })).toEqual(DEFAULT_ACADEMIC_CALENDAR);
    expect(parseAcademicCalendarConfig({ version: 1, terms: [{ ...DEFAULT_ACADEMIC_CALENDAR.terms[0], source: null }] })).toEqual(DEFAULT_ACADEMIC_CALENDAR);
    expect(parseAcademicCalendarConfig({ version: 1, terms: [
      DEFAULT_ACADEMIC_CALENDAR.terms[0],
      { ...DEFAULT_ACADEMIC_CALENDAR.terms[1], startsOn: "2026-06-01" },
    ] })).toEqual(DEFAULT_ACADEMIC_CALENDAR);
    expect(parseAcademicCalendarConfig(null)).toEqual(DEFAULT_ACADEMIC_CALENDAR);
  });
});
