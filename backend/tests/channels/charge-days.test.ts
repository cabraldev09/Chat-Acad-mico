import { describe, expect, it, vi } from "vitest";

const store: Record<string, string> = {};
vi.mock("../../src/helpers/AppSettings", () => ({
  getSetting: async (k: string, d: string) => (k in store ? store[k] : d),
  setSetting: async (k: string, v: string) => { store[k] = v; }
}));

import { chargeDaysBeforeOf, efiWebhookSecret } from "../../src/services/PaymentServices/EfiSettings";

describe("dias antes do vencimento para gerar o boleto", () => {
  it("vazio ou inválido continua 3; 0 só quando digitado", () => {
    expect(chargeDaysBeforeOf("")).toBe(3);
    expect(chargeDaysBeforeOf(undefined)).toBe(3);
    expect(chargeDaysBeforeOf(null)).toBe(3);
    expect(chargeDaysBeforeOf("abc")).toBe(3);
    expect(chargeDaysBeforeOf("-2")).toBe(3);
    expect(chargeDaysBeforeOf("1.5")).toBe(3);
    expect(chargeDaysBeforeOf("0")).toBe(0);
    expect(chargeDaysBeforeOf(0)).toBe(0);
    expect(chargeDaysBeforeOf(" 5 ")).toBe(5);
    expect(chargeDaysBeforeOf("90")).toBe(30);
  });
});

describe("segredo do aviso de pagamento da Efí", () => {
  it("o servidor cria uma vez e depois reaproveita", async () => {
    const first = await efiWebhookSecret();
    expect(first).toMatch(/^[0-9a-f]{40}$/);
    expect(await efiWebhookSecret()).toBe(first);
  });
});
