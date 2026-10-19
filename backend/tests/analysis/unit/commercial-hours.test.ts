import { describe, expect, it, vi } from "vitest";

// the company timezone is read from the settings table; no database is needed here
vi.mock("../../../src/models/Setting", () => ({ default: {} }));

import { nextOpening, whenText } from "../../../src/services/CommercialServices/Hours";

const work = [{ start: "08:00", end: "18:00" }];
const config = { enabled: true, days: { "0": [], "1": work, "2": work, "3": work, "4": work, "5": work, "6": [{ start: "08:00", end: "12:00" }] } };

// Porto Velho is UTC-4 all year: 08:00 there is 12:00Z
describe("when the team answers next", () => {
  it("no working hours configured: there is no next opening", () => {
    expect(nextOpening({ enabled: false, days: config.days }, new Date("2026-10-19T22:00:00Z"))).toBeNull();
    expect(nextOpening(null)).toBeNull();
  });
  it("after the closing of a weekday it opens the next morning", () => {
    // Monday 19/10/2026 19:00 in Porto Velho
    const at = nextOpening(config, new Date("2026-10-19T23:00:00Z"));
    expect(at && at.toISOString()).toBe("2026-10-20T12:00:00.000Z");
  });
  it("before the opening it opens the same day", () => {
    const at = nextOpening(config, new Date("2026-10-19T10:00:00Z"));
    expect(at && at.toISOString()).toBe("2026-10-19T12:00:00.000Z");
  });
  it("friday evening goes to Saturday morning, Saturday afternoon goes to Monday", () => {
    expect(nextOpening(config, new Date("2026-10-23T23:00:00Z"))!.toISOString()).toBe("2026-10-24T12:00:00.000Z");
    expect(nextOpening(config, new Date("2026-10-24T20:00:00Z"))!.toISOString()).toBe("2026-10-26T12:00:00.000Z");
  });
  it("says it in words", () => {
    const now = new Date("2026-10-19T23:00:00Z");
    expect(whenText(new Date("2026-10-20T12:00:00Z"), now)).toBe("amanhã às 08:00");
    expect(whenText(new Date("2026-10-19T23:30:00Z"), now)).toMatch(/^hoje às/);
    expect(whenText(new Date("2026-10-26T12:00:00Z"), now)).toMatch(/^segunda-feira às 08:00/);
    expect(whenText(null)).toBeNull();
  });
});

import { defaultFollowUp, parseFollowUp, todayLine, ymdOf } from "../../../src/services/CommercialServices/Hours";

describe("the day a person says they will come back", () => {
  const now = new Date("2026-10-19T17:00:00Z"); // 13:00 in Porto Velho
  it("is 09:00 of that day in Porto Velho, not midnight UTC", () => {
    const at = parseFollowUp("2026-12-01", now)!;
    expect(at.toISOString()).toBe("2026-12-01T13:00:00.000Z");
    expect(ymdOf(at)).toBe("2026-12-01");
  });
  it("an invalid or past day is no day, and a far day is cut to 90 days", () => {
    expect(parseFollowUp("amanhã", now)).toBeNull();
    expect(parseFollowUp("2026-02-31", now)).toBeNull();
    expect(parseFollowUp("2026-10-01", now)).toBeNull();
    expect(parseFollowUp(null, now)).toBeNull();
    expect(parseFollowUp("2030-01-01", now)!.getTime()).toBeLessThanOrEqual(now.getTime() + 91 * 86400000);
  });
  it("without a day, two days later at 09:00", () => {
    expect(defaultFollowUp(now).toISOString()).toBe("2026-10-21T13:00:00.000Z");
  });
  it("the model is told what day it is", () => {
    expect(todayLine(now)).toBe("Hoje é segunda-feira, 19/10/2026 (fuso de Porto Velho). Datas sempre como AAAA-MM-DD.");
  });
});
