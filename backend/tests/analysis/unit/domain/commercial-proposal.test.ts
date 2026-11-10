import { describe, expect, it } from "vitest";

import { buildCommercialMessage, buildCommercialProposal, type CommercialProposalInput } from "../../../../src/analysis/domain/commercial/proposal";

const base: CommercialProposalInput = {
  studentName: "Maria Souza",
  courseName: "Administração",
  totalSubjects: 40,
  exemptedSubjects: 24,
  totalPeriods: 8,
  projectedPeriods: 4,
  estimatedCompletionTerm: "2028.2"
};

describe("commercial proposal (indicators and message)", () => {
  it("counts the share of the matrix reused and the semesters saved", () => {
    const p = buildCommercialProposal(base);
    expect(p.exemptedPercentage).toBe(60);
    expect(p.savedTerms).toBe(4);
    expect(p.isHighValue).toBe(true);
    expect(p.highValueReason).toContain("60%");
  });

  it("is a priority lead from 50% reused, and not below", () => {
    expect(buildCommercialProposal({ ...base, exemptedSubjects: 20 }).isHighValue).toBe(true);
    const low = buildCommercialProposal({ ...base, exemptedSubjects: 19 });
    expect(low.isHighValue).toBe(false);
    expect(low.highValueReason).toBeNull();
  });

  it("never divides by zero nor invents savings when the forecast is unknown", () => {
    const empty = buildCommercialProposal({ ...base, totalSubjects: 0, exemptedSubjects: 0, projectedPeriods: null, totalPeriods: 0 });
    expect(empty.exemptedPercentage).toBe(0);
    expect(empty.savedTerms).toBeNull();
    expect(buildCommercialProposal({ ...base, projectedPeriods: 12 }).savedTerms).toBe(0);
  });

  it("writes the WhatsApp text without promising any financial condition", () => {
    const text = buildCommercialMessage(base);
    expect(text).toContain("Olá, Maria Souza!");
    expect(text).toContain("*24 disciplinas*");
    expect(text).toContain("60% da grade");
    expect(text).toContain("*4 semestre(s)*");
    expect(text).toContain("*2028.2*");
    expect(text).toMatch(/Estimativas sujeitas/);
    expect(text).not.toMatch(/R\$|desconto|gratuit|bolsa/i);
  });

  it("leaves out the lines it has no data for", () => {
    const text = buildCommercialMessage({ ...base, studentName: null, courseName: null, projectedPeriods: null, estimatedCompletionTerm: null });
    expect(text.startsWith("Olá!")).toBe(true);
    expect(text).not.toContain("Curso:");
    expect(text).not.toContain("semestre(s)");
    expect(text).not.toContain("conclusão");
  });
});
