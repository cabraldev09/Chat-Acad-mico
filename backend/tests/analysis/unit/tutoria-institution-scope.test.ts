import { beforeEach, describe, expect, it, vi } from "vitest";

const { rows } = vi.hoisted(() => ({ rows: vi.fn(async () => []) }));
vi.mock("../../../src/services/AnalyticsServices/AnalyticsService", () => ({
  rows,
  LEAD_IN_INSTITUTION: "LEAD_IN_INSTITUTION"
}));

import { tutoriaInsights } from "../../../src/services/AnalyticsServices/TutoriaInsights";

describe("tutoria analytics scoping", () => {
  beforeEach(() => rows.mockClear());

  it("limits every aggregate to authorized polos and matches ticket institution to its lead", async () => {
    await tutoriaInsights(null, new Date("2026-11-01T00:00:00Z"), new Date("2026-11-30T23:59:59Z"), [4, 9]);

    expect(rows).toHaveBeenCalledTimes(3);
    for (const [sql, replacements] of rows.mock.calls) {
      expect(String(sql)).toContain("l.poloId IN (:polos)");
      expect((replacements as any).polos).toEqual([4, 9]);
    }
    expect(String(rows.mock.calls[0][0])).toContain("t.institutionId IS NOT DISTINCT FROM l.institutionId");
  });

  it("returns no coordinator data when they have no assigned polos", async () => {
    await tutoriaInsights(null, new Date(), new Date(), []);
    expect(rows.mock.calls.every(([, replacements]) => (replacements as any).polos[0] === 0)).toBe(true);
  });
});
