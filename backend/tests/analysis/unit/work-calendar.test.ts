import { describe, expect, it } from "vitest";
import { countWorkDays, easterOf, holidaysBetween, isWorkDay, parseExtraDays } from "../../../src/helpers/WorkCalendar";

describe("the working-day calendar", () => {
  it("finds Easter and the days that hang on it", () => {
    expect(easterOf(2025)).toBe("2025-04-20");
    expect(easterOf(2026)).toBe("2026-04-05");
    expect(easterOf(2027)).toBe("2027-03-28");
    const h = holidaysBetween("2026-02-01", "2026-06-30").map(x => `${x.date} ${x.name}`);
    expect(h).toContain("2026-02-16 Carnaval (segunda)");
    expect(h).toContain("2026-04-03 Sexta-feira Santa");
    expect(h).toContain("2026-06-04 Corpus Christi");
    expect(h).toContain("2026-06-18 Dia do Evangélico (Rondônia)");
  });

  it("takes the holidays out of the working days, but a Sunday holiday takes nothing", () => {
    // 14/05 to 16/11/2026: 133 weekdays, 5 of them holidays (04/06, 18/06, 07/09, 12/10, 02/11); 15/11 is a Sunday
    expect(countWorkDays("2026-05-14", "2026-11-16", 5)).toBe(128);
    expect(countWorkDays("2026-05-14", "2026-11-16", 7)).toBe(187);
    expect(countWorkDays("2026-11-02", "2026-11-02", 5)).toBe(0);
    expect(countWorkDays("2026-11-03", "2026-11-02", 5)).toBe(0);
  });

  it("Saturday counts for a Monday-to-Saturday company, and a holiday that falls on it does not", () => {
    expect(isWorkDay("2026-05-02", 6, new Set())).toBe(true);
    expect(isWorkDay("2026-05-02", 5, new Set())).toBe(false);
    expect(isWorkDay("2026-05-02", 6, new Set(["2026-05-02"]))).toBe(false);
  });

  it("the company can add its own days and they count once", () => {
    expect(parseExtraDays("29/05/2026\n2026-05-29, 31/02/2026; abc; 5/6/2026")).toEqual(["2026-05-29", "2026-06-05"]);
    expect(countWorkDays("2026-05-25", "2026-05-29", 5)).toBe(5);
    expect(countWorkDays("2026-05-25", "2026-05-29", 5, ["2026-05-29"])).toBe(4);
    // a day that is already a holiday is not taken out twice
    expect(countWorkDays("2026-09-07", "2026-09-07", 5, ["2026-09-07"])).toBe(0);
  });
});
