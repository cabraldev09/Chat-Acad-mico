import { describe, expect, it, vi } from "vitest";

vi.mock("../../../../src/models/EnrollmentProof", () => ({ default: {} }));
vi.mock("../../../../src/models/Goal", () => ({ default: {} }));
vi.mock("../../../../src/models/GoalChange", () => ({ default: {} }));
vi.mock("../../../../src/models/GoalPolo", () => ({ default: {} }));
vi.mock("../../../../src/models/Lead", () => ({ default: {} }));
vi.mock("../../../../src/models/LeadEnrollment", () => ({ default: {} }));
vi.mock("../../../../src/models/Polo", () => ({ default: {} }));
vi.mock("../../../../src/models/User", () => ({ default: {} }));
vi.mock("../../../../src/models/Course", () => ({ default: {} }));
vi.mock("../../../../src/services/CommercialServices/EnrollmentProof", () => ({ proofFilePath: () => null, storeProof: async () => ({}) }));

import { goalStatusOf } from "../../../../src/controllers/EnrollmentController";

describe("matrícula dentro da meta", () => {
  const periods = [{ title: "Graduação 1º semestre de 2027", start: "2026-11-17", end: "2027-05-03" }];
  it("conta como dentro quando o dia cai no período da meta do polo", () => {
    expect(goalStatusOf("2026-11-17", periods)).toEqual({ inGoal: true, goal: "Graduação 1º semestre de 2027" });
    expect(goalStatusOf("2027-05-03", periods).inGoal).toBe(true);
    expect(goalStatusOf("2026-11-16", periods)).toEqual({ inGoal: false, goal: null });
    expect(goalStatusOf("2026-12-01", undefined).inGoal).toBe(false);
  });
});
