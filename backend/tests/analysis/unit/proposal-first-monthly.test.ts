import { describe, expect, it } from "vitest";

import { baseMonthly, calcProposal, firstPayment, ProposalParams } from "../../../src/services/ProposalServices/calc";
import { renderProposalHtml } from "../../../src/services/ProposalServices/render";
import { buildProposalMessages } from "../../../src/services/ProposalServices/proposalMessage";

const params = (over: Partial<ProposalParams> = {}): ProposalParams => ({
  gross: 954.8, monthly: 220, firstMonthly: 220, enrollmentFee: 99, dueDay: 10, installments: 6, semesters: 8, courseSemesters: 8,
  startYear: 2027, startSemester: 1, bolsaFirst: 25, bolsaNext: 20, punctualityPct: 25, lateFee1Pct: 15, lateFee2Pct: 25,
  annualMin: 5, annualMax: 11, semestralSchedule: [{ from: 2, pct: 2 }, { from: 6, pct: 3 }], firstDueDate: "2027-02-01", ...over
});
const render = (p: ProposalParams, institution: any = { name: "Universidade Cruzeiro do Sul Virtual", cnpj: "07.158.229/0007-93" }) =>
  renderProposalHtml({ title: "Pedagogia", leadName: "Ana Teste", institution, params: p, result: calcProposal(p), texts: {}, generatedAt: new Date("2026-11-25T12:00:00Z") });

describe("1ª mensalidade da proposta", () => {
  it("reproduz a tabela de referência com mensalidade negociada, ingresso de 30% e demais de 20%", () => {
    const result = calcProposal(params({ gross: 756.3, monthly: 147.35, firstMonthly: 147.35, semesters: 4,
      startYear: 2026, startSemester: 2, bolsaFirst: 30, bolsaNext: 20 }));
    expect(result.bolsaApplied).toBe(80.52);
    expect(result.tiers).toEqual({ onTime: 147.35, mid: 169.45, late: 184.19 });
    expect(result.rows.map(r => [r.period, r.bolsa, r.bolsaAdjust, r.monthlyMin, r.monthlyMax, r.diff])).toEqual([
      ["2026.2", 30, 0, 147.35, 147.35, 0],
      ["2027.1", 20, 10, 172.40, 181.24, 8.84],
      ["2027.2", 20, 0, 175.85, 184.87, 9.02],
      ["2028.1", 20, 0, 188.16, 208.90, 20.74],
    ]);
  });
  it("is the same as the others by default and the maths start from the monthly fee with the scholarship", () => {
    const p = params();
    expect(baseMonthly(p)).toBe(220);
    expect(firstPayment(p)).toBe(220);
    const r = calcProposal(p);
    expect(r.tiers.onTime).toBe(220);
    expect(r.bolsaApplied).toBeCloseTo(76.96, 2);
  });

  it("a waived 1st installment costs R$ 0 and changes neither the scholarship nor the projection", () => {
    const normal = calcProposal(params());
    const p = params({ firstExempt: true, firstMonthly: 0 });
    const r = calcProposal(p);
    expect(firstPayment(p)).toBe(0);
    expect(r.bolsaApplied).toBe(normal.bolsaApplied);
    expect(r.tiers).toEqual(normal.tiers);
    expect(r.rows.map(x => x.monthlyMin)).toEqual(normal.rows.map(x => x.monthlyMin));
    const html = render(p);
    expect(html).toContain("isenta (R$ 0,00)");
    expect(html).toContain("vencimento 01/02/2027");
    // the 1st installment is waived, but the enrollment fee is still charged at the act: it is the total of the order
    expect(html).toMatch(/Valor total do pedido<\/span><span>R\$ 99,00/);
    expect(html).toContain("R$ 220,00"); // the 2nd installment on keeps the value of the others
  });

  it("a 1st installment with its own value shows that value and keeps the others", () => {
    const p = params({ firstMonthly: 150 });
    const html = render(p);
    expect(html).toMatch(/Primeira Mensalidade:<\/b> R\$ 150,00/);
    expect(calcProposal(p).tiers.onTime).toBe(220);
    const summary = buildProposalMessages({ leadName: "Ana", courseName: "Pedagogia", params: p, result: calcProposal(p) } as any).find(b => b.id === "summary")?.text;
    expect(summary).toMatch(/\*Mensalidade com bolsa:\* R\$\s220,00/);
    expect(summary).toMatch(/\*1ª mensalidade:\* R\$\s150,00/);
  });

  it("a proposal made before the separate value (only firstMonthly, waived) keeps its numbers", () => {
    const old = params({ monthly: undefined, firstMonthly: 220, firstExempt: true });
    expect(baseMonthly(old)).toBe(220);
    expect(firstPayment(old)).toBe(0);
    expect(calcProposal(old).tiers.onTime).toBe(220);
  });
});

describe("logo da proposta", () => {
  it("a Cruzeiro do Sul university without its own logo uses the brand's logo", () => {
    expect(render(params())).toContain('<img src="data:image/svg+xml;base64,');
  });
  it("another university without a logo shows only its name", () => {
    const html = render(params(), { name: "Outra Universidade" });
    expect(html).not.toContain("<img");
    expect(html).toContain("Outra Universidade");
  });

  it("o pedido é só a taxa de matrícula: a mensalidade é paga à instituição e não entra no total; isenta não soma", () => {
    const charged = render(params({ firstExempt: true, firstMonthly: 0 }));
    expect(charged).toMatch(/<td><b>Taxa de matrícula<\/b>[\s\S]*?<td>R\$ 99,00<\/td><td>-<\/td><td class="r">R\$ 99,00<\/td>/);
    expect(charged).toMatch(/Valor total do pedido<\/span><span>R\$ 99,00/);
    // a 1st monthly fee that is charged is the institution's: the order stays the enrollment fee only
    const both = render(params());
    expect(both).toMatch(/Valor total do pedido<\/span><span>R\$ 99,00/);
    expect(both).not.toMatch(/1ª mensalidade<\/div><\/td>/);
    expect(both).toContain("As mensalidades são pagas diretamente à instituição");
    const exempt = render(params({ enrollmentExempt: true }));
    expect(exempt).toMatch(/Taxa de matrícula:<\/b> isenta/);
    expect(exempt).toMatch(/<td><b>Taxa de matrícula<\/b>[\s\S]*?Isenta<\/td><td class="r">R\$ 0,00/);
    expect(exempt).toMatch(/Valor total do pedido<\/span><span>R\$ 0,00/);
  });
});
