import { describe, expect, it, vi } from "vitest";

vi.mock("../services/api", () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn() } }));
import { problemsOf, followBolsa, toForm, toParams } from "../pages/CRM/ProposalStudio";

const base = { gross: "1073,80", first: "214,76", bolsa: "80,00", firstExempt: false, firstSame: true, firstPay: "214,76" };

describe("travas da proposta", () => {
  it("valores certos não têm problema", () => {
    expect(problemsOf(base)).toEqual({});
  });
  it("mensalidade com bolsa acima da bruta é recusada no campo (o caso do print: 1221,45 com bruta 1073,80)", () => {
    expect(problemsOf({ ...base, first: "1221,45" }).first).toBe("Não pode passar da mensalidade bruta (R$ 1.073,80)");
  });
  it("mensalidade zero e bolsa fora de 0% a 100% também", () => {
    expect(problemsOf({ ...base, first: "0,00" }).first).toBe("Informe um valor maior que zero");
    // a new proposal with no course yet (no gross fee) is not an error in the field
    expect(problemsOf({ ...base, gross: "0,00", first: "0,00", bolsa: "" })).toEqual({});
    expect(problemsOf({ ...base, bolsa: "-13,75" }).bolsa).toBe("A bolsa fica entre 0% e 100%");
    expect(problemsOf({ ...base, bolsa: "120" }).bolsa).toBe("A bolsa fica entre 0% e 100%");
  });
  it("a 1ª mensalidade com valor próprio não passa da bruta", () => {
    expect(problemsOf({ ...base, firstSame: false, firstPay: "2000,00" }).firstPay).toMatch(/Não pode passar/);
    expect(problemsOf({ ...base, firstExempt: true, firstSame: false, firstPay: "2000,00" }).firstPay).toBeUndefined();
  });
});

describe("bolsa comercial e bolsa de ingresso independentes", () => {
  it("mudar o desconto total não muda os 30% de ingresso nem os 20% dos demais semestres", () => {
    expect(followBolsa({ hasRegression: true, fixedUntilEnd: false }, "80,52")).toEqual({ bolsa: "80,52" });
  });
  it("reabrir e salvar preserva o valor negociado e as bolsas usadas na projeção", () => {
    const f = toForm({ gross: 756.3, monthly: 147.35, firstMonthly: 147.35, bolsaFirst: 30, bolsaNext: 20,
      hasRegression: true, startYear: 2026, startSemester: 2, semesters: 4 }, []);
    expect(f.bolsa).toBe("80,52");
    expect(f.bolsaFirst).toBe("30,00");
    expect(f.bolsaNext).toBe("20,00");
    expect(toParams(f)).toMatchObject({ monthly: 147.35, firstMonthly: 147.35, bolsaFirst: 30, bolsaNext: 20 });
  });
  it("as duas bolsas de projeção também precisam ficar entre zero e cem", () => {
    expect(problemsOf({ ...base, bolsaFirst: "130", bolsaNext: "-5" })).toMatchObject({
      bolsaFirst: "A bolsa fica entre 0% e 100%", bolsaNext: "A bolsa fica entre 0% e 100%",
    });
  });
});
