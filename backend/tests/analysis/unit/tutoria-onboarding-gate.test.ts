import { describe, expect, it } from "vitest";
import { missingSteps } from "../../../src/services/CrmServices/OnboardingChecklist";

describe("checklist da ambientação", () => {
  it("diz as etapas que faltam para concluir", () => {
    expect(missingSteps(JSON.stringify({ first_access: "2026-11-01", ava: "x" })).map(s => s.key)).toEqual(["polo_contacts", "documents", "access"]);
    expect(missingSteps(JSON.stringify({ first_access: 1, ava: 1, polo_contacts: 1, documents: 1, access: 1 }))).toEqual([]);
    expect(missingSteps(null).length).toBe(5);
  });
});
