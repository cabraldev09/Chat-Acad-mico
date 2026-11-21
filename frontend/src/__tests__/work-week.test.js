import { describe, expect, it } from "vitest";
import { STANDARD_WEEK, dayDefault, standardDays } from "../utils/workWeek";

describe("semana padrão do time", () => {
  it("segunda a quinta até as 18h, sexta até as 17h, sem fim de semana", () => {
    expect(STANDARD_WEEK[1]).toEqual([{ start: "08:00", end: "18:00" }]);
    expect(STANDARD_WEEK[5]).toEqual([{ start: "08:00", end: "17:00" }]);
    expect(STANDARD_WEEK[6]).toEqual([]);
    expect(dayDefault(5)).toEqual({ start: "08:00", end: "17:00" });
    expect(dayDefault(6)).toEqual({ start: "08:00", end: "18:00" });
  });
  it("cada cópia é independente (editar um dia não muda o padrão)", () => {
    const a = standardDays();
    a[1][0].end = "12:00";
    expect(standardDays()[1][0].end).toBe("18:00");
  });
});
