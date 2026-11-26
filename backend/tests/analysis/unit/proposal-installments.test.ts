import { describe, expect, it } from "vitest";

import { calcProposal, cardPlanOf, installmentsFor, modelFitsCourse, parseDurationTable, parseLevels, pixPctOf, pixValueOf, ProposalParams } from "../../../src/services/ProposalServices/calc";
import { renderProposalHtml } from "../../../src/services/ProposalServices/render";
import { buildProposalMessages } from "../../../src/services/ProposalServices/proposalMessage";

const params = (over: Partial<ProposalParams> = {}): ProposalParams => ({
  gross: 300, monthly: 300, firstMonthly: 300, enrollmentFee: 99, dueDay: 10, installments: 6, semesters: 1, courseSemesters: 1,
  startYear: 2027, startSemester: 1, bolsaFirst: 0, bolsaNext: 0, punctualityPct: 0, lateFee1Pct: 0, lateFee2Pct: 0,
  annualMin: 0, annualMax: 0, semestralSchedule: [], firstDueDate: "2027-02-01", planType: "parcelado", installmentsTotal: 15,
  certification: "charge", certificationFee: 150, ...over
});
const html = (p: ProposalParams) => renderProposalHtml({ title: "Pós em Gestão", leadName: "Ana Teste", institution: { name: "Outra" }, params: p, result: calcProposal(p), texts: {}, generatedAt: new Date("2026-11-25T12:00:00Z") });
const summaryOf = (p: ProposalParams) => buildProposalMessages({ leadName: "Ana", courseName: "Pós em Gestão", params: p, result: calcProposal(p) } as any).find(b => b.id === "summary")!.text;

describe("parcelas pela duração do curso", () => {
  const table = parseDurationTable("6=12\n9=15, 12=18");
  it("lê a tabela digitada pela gestão e a guardada em JSON", () => {
    expect(table).toEqual([{ months: 6, installments: 12 }, { months: 9, installments: 15 }, { months: 12, installments: 18 }]);
    expect(parseDurationTable(JSON.stringify(table))).toEqual(table);
    expect(parseDurationTable("")).toEqual([]);
  });
  it("o número do curso vale mais; senão a duração; senão o fixo do modelo; senão um por mês", () => {
    expect(installmentsFor({ installmentsTotal: 10, durationMonths: 9 }, table, 24)).toBe(10);
    expect(installmentsFor({ durationMonths: 9 }, table, 24)).toBe(15);
    expect(installmentsFor({ durationMonths: 12 }, table, null)).toBe(18);
    expect(installmentsFor({ durationMonths: 8 }, table, 24)).toBe(24);
    expect(installmentsFor({ durationMonths: 8 }, table, null)).toBe(8);
  });
});

describe("proposta parcelada", () => {
  it("parcelas de valor fixo, sem projeção, com a 1ª isenta ou com valor próprio", () => {
    const r = calcProposal(params());
    expect(r.rows).toEqual([]);
    expect(r.plan).toMatchObject({ installments: 15, first: 300, monthly: 300, total: 4500, single: null });
    expect(calcProposal(params({ firstExempt: true, firstMonthly: 0 })).plan!.total).toBe(4200);
    expect(calcProposal(params({ firstMonthly: 100 })).plan!.total).toBe(4300);
  });
  it("o PDF e o resumo dizem as parcelas, a taxa de matrícula e a de certificação; sem projeção", () => {
    const h = html(params());
    expect(h).toMatch(/Parcelas:<\/b> 15 de R\$\s?300,00/);
    expect(h).toMatch(/Taxa de certificação:<\/b> R\$\s?150,00/);
    expect(h).not.toContain("Projeção por semestre");
    expect(h).toMatch(/Valor total do curso<\/span><span>R\$\s?4\.500,00/);
    expect(html(params({ certification: "exempt" }))).toMatch(/Taxa de certificação:<\/b> isenta/);
    expect(html(params({ certification: "none" }))).not.toContain("certificação");
    expect(html(params({ enrollmentExempt: true, enrollmentFee: 0 }))).toMatch(/Taxa de matrícula:<\/b> isenta/);
    const s = summaryOf(params());
    expect(s).toMatch(/\*Parcelas:\* 15 de R\$\s?300,00/);
    expect(s).toMatch(/Taxa de certificação:\* R\$\s?150,00, paga ao concluir/);
    expect(s).not.toMatch(/semestre/i);
  });
});

describe("parcela única e formas de pagamento", () => {
  it("Pix: a % dá o valor e o valor dá a %", () => {
    expect(pixValueOf(1000, 10)).toBe(900);
    expect(pixPctOf(1000, 900)).toBe(10);
    expect(pixPctOf(1000, 1200)).toBe(0);
  });
  it("cartão: com repasse, a parcela da maquininha (tabela Price); sem repasse, o valor dividido", () => {
    const withInterest = cardPlanOf(1000, 10, 1.99, true);
    expect(withInterest.installment).toBeCloseTo(111.25, 1);
    expect(withInterest.total).toBeGreaterThan(1000);
    expect(cardPlanOf(1000, 10, 1.99, false)).toMatchObject({ installment: 100, total: 1000 });
    expect(cardPlanOf(1000, 1, 1.99, true)).toMatchObject({ installments: 1 });
  });
  it("o curso pago de uma vez mostra boleto, Pix com desconto e cartão", () => {
    const p = params({ singlePayment: true, singleValue: 1200, pixDiscountPct: 10, cardInstallments: 6, cardRatePct: 2, cardPassInterest: true, certification: "none" });
    const r = calcProposal(p);
    expect(r.plan!.single).toMatchObject({ value: 1200, pix: 1080, pixPct: 10 });
    const h = html(p);
    expect(h).toMatch(/Boleto:<\/b> R\$\s?1\.200,00/);
    expect(h).toMatch(/Pix:<\/b> R\$\s?1\.080,00/);
    expect(h).toMatch(/Cartão de crédito:<\/b> 6x de R\$/);
    expect(h).toContain("parcela única");
  });
});

describe("modelo certo para o nível do curso", () => {
  const pos = JSON.stringify(["Pós-graduação", "MBA"]);
  it("modelo sem níveis serve para todos; com níveis, só para os cursos desses níveis", () => {
    expect(modelFitsCourse(null, { level: "Bacharelado" })).toBe(true);
    expect(modelFitsCourse(pos, { level: "Pós-graduação" })).toBe(true);
    expect(modelFitsCourse(pos, { level: null, category: "Pós-graduação - EAD" })).toBe(true);
    expect(modelFitsCourse(pos, { level: "Bacharelado", category: "Graduação" })).toBe(false);
    expect(modelFitsCourse(JSON.stringify(["Graduação"]), { level: null, category: "Pós-graduação" })).toBe(false);
    expect(modelFitsCourse(pos, null)).toBe(false);
  });
  it("aceita a lista em JSON ou separada por vírgula", () => {
    expect(parseLevels("Técnico regular, Profissionalizante")).toEqual(["Técnico regular", "Profissionalizante"]);
    expect(parseLevels(pos)).toEqual(["Pós-graduação", "MBA"]);
    expect(parseLevels("")).toEqual([]);
  });
});
