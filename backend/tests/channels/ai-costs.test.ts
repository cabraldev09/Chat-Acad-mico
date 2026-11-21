import { describe, expect, it, vi, beforeEach } from "vitest";

const settings: Record<string, string> = {};
const secrets: Record<string, string> = {};
const get = vi.fn();
vi.mock("../../src/helpers/AppSettings", () => ({ getSetting: async (k: string, d = "") => (k in settings ? settings[k] : d) }));
vi.mock("../../src/helpers/SecretSettings", () => ({ getSecretSetting: async (k: string) => secrets[k] || "" }));
vi.mock("../../src/helpers/AppTime", () => ({ getAppTz: () => "America/Porto_Velho" }));
vi.mock("../../src/database", () => ({ default: { query: async () => [{ usd: 2 }] } }));
vi.mock("axios", () => ({ default: { get: (...a: any[]) => get(...a) } }));

import { defaultPriceOf, priceInfoOf } from "../../src/services/AiServices/Prices";
import { monthBudget, openaiRealCosts } from "../../src/services/AiServices/RealCosts";

beforeEach(() => { Object.keys(settings).forEach(k => delete settings[k]); Object.keys(secrets).forEach(k => delete secrets[k]); get.mockReset(); });

describe("preço dos modelos de IA", () => {
  it("usa o preço de referência do modelo conhecido, também com a data no nome", () => {
    expect(defaultPriceOf("gpt-4o-mini")).toEqual({ in: 0.15, out: 0.6 });
    expect(defaultPriceOf("gpt-4o-mini-2024-07-18")).toEqual({ in: 0.15, out: 0.6 });
    expect(defaultPriceOf("gpt-4o")).toEqual({ in: 2.5, out: 10 });
    expect(defaultPriceOf("claude-haiku-5-5")).toEqual({ in: 0.1, out: 0.5 });
    expect(defaultPriceOf("modelo-desconhecido")).toBeNull();
  });
  it("o preço cadastrado pela equipe vale mais que a referência", async () => {
    settings["ai_price_gpt-4o-mini"] = "1,2";
    expect(await priceInfoOf("gpt-4o-mini")).toEqual({ in: 1, out: 2, source: "cadastrado" });
    expect(await priceInfoOf("gpt-4.1-mini")).toEqual({ in: 0.4, out: 1.6, source: "padrão" });
  });
});

describe("gasto real da OpenAI e orçamento do mês", () => {
  it("sem chave de administrador não consulta a OpenAI", async () => {
    expect(await openaiRealCosts(new Date("2026-11-01T04:00:00Z"))).toBeNull();
    expect(get).not.toHaveBeenCalled();
  });
  it("soma os custos por dia e segue as páginas", async () => {
    secrets.ai_openai_admin_key = "admin";
    get.mockResolvedValueOnce({ data: { data: [{ start_time: Date.UTC(2026, 10, 2, 12) / 1000, results: [{ amount: { value: 1.25 } }, { amount: { value: 0.5 } }] }], has_more: true, next_page: "p2" } })
      .mockResolvedValueOnce({ data: { data: [{ start_time: Date.UTC(2026, 10, 3, 12) / 1000, results: [{ amount: { value: 2 } }] }], has_more: false } });
    const real = await openaiRealCosts(new Date("2026-11-01T04:00:00Z"), new Date("2026-11-04T04:00:00Z"));
    expect(real).toMatchObject({ ok: true, usd: 3.75 });
    expect(real!.byDay.map(d => d.day)).toEqual(["2026-11-02", "2026-11-03"]);
    expect(get.mock.calls[1][1].params.page).toBe("p2");
  });
  it("chave recusada vira um aviso claro, sem quebrar a tela", async () => {
    secrets.ai_openai_admin_key = "errada";
    get.mockRejectedValueOnce({ response: { status: 401, data: { error: { message: "bad" } } } });
    const real = await openaiRealCosts(new Date("2026-10-01T04:00:00Z"), new Date("2026-10-02T04:00:00Z"));
    expect(real).toMatchObject({ ok: false, usd: 0 });
    expect(real!.error).toMatch(/chave de administrador/);
  });
  it("orçamento: mostra o restante e avisa a partir de 80%", async () => {
    expect(await monthBudget()).toBeNull();
    settings.ai_monthly_budget_usd = "2.4";
    const b = await monthBudget();
    expect(b).toMatchObject({ limit: 2.4, spent: 2, remaining: 0.4, source: "estimado", warn: true });
  });
});
