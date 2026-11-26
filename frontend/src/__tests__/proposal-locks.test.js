import { describe, expect, it, vi } from "vitest";

vi.mock("../services/api", () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn() } }));
import { problemsOf, followBolsa } from "../pages/CRM/ProposalStudio";

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

describe("uma bolsa só, em três lugares", () => {
  it("mudar a bolsa aplicada ou a do 1º semestre muda as duas (o caso do print: 30% no 1º semestre não mexia na proposta)", () => {
    expect(followBolsa({ hasRegression: true, fixedUntilEnd: false }, "30,00")).toEqual({ bolsa: "30,00", bolsaFirst: "30,00" });
  });
  it("com a mensalidade fixa até o fim, ou sem regressão, a bolsa dos demais acompanha", () => {
    expect(followBolsa({ hasRegression: true, fixedUntilEnd: true }, "30,00")).toEqual({ bolsa: "30,00", bolsaFirst: "30,00", bolsaNext: "30,00" });
    expect(followBolsa({ hasRegression: false, fixedUntilEnd: false }, "25,00").bolsaNext).toBe("25,00");
  });
});
