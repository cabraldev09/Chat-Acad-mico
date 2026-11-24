import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/models/Goal", () => ({ default: { findAll: async () => [] } }));
import { currentSemester } from "../../src/controllers/GoalController";

describe("o semestre em vigor", () => {
  it("entre as metas de polo que contêm hoje, vale a mais longa (uma meta de um mês não toma o lugar do semestre)", () => {
    const list = [
      { id: 2, startsOn: "2026-11-26", endsOn: "2026-12-26" },
      { id: 1, startsOn: "2026-11-17", endsOn: "2027-05-03" },
      { id: 3, startsOn: "2026-06-01", endsOn: "2026-11-16" }
    ];
    expect(currentSemester(list, "2026-12-01")?.id).toBe(1);
    expect(currentSemester(list, "2027-04-01")?.id).toBe(1);
    expect(currentSemester(list, "2026-10-01")?.id).toBe(3);
    expect(currentSemester(list, "2028-01-01")).toBeUndefined();
  });
});
