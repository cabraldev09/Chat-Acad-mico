import { afterEach, describe, expect, it, vi } from "vitest";

// (the route is imported in the last test: no database is opened, the refusal comes before any query)
vi.mock("../../src/database", () => ({ default: { query: vi.fn(async () => { throw new Error("a rota consultou o banco sem segredo"); }), getDialect: () => "postgres" } }));
// (the sending services of the other routes of the same controller are not part of this test)
vi.mock("../../src/services/ChannelServices/SendToContact", () => ({ default: vi.fn() }));
vi.mock("../../src/services/ChannelServices/ResolveOutboundContact", () => ({ resolveOutboundContact: vi.fn() }));
vi.mock("../../src/services/WhatsappService/ListWhatsAppsService", () => ({ default: vi.fn() }));
vi.mock("../../src/helpers/GetDefaultWhatsApp", () => ({ default: vi.fn() }));

import { MAX_PERIOD_DAYS, cleanIndicatorQuery } from "../../src/services/IndicatorServices/IndicatorQuery";

const code = (fn: () => unknown): string => { try { fn(); return "ok"; } catch (e: any) { return `${e.statusCode} ${e.message}`; } };

describe("período e polo dos indicadores da API", () => {
  it("até 93 dias, datas válidas e em ordem", () => {
    expect(MAX_PERIOD_DAYS).toBe(93);
    expect(cleanIndicatorQuery({ de: "2026-10-01", ate: "2026-12-31" }, null)).toEqual({ from: "2026-10-01", to: "2026-12-31", poloId: null, tokenPolos: null });
    // 1/10 a 1/1 = 93 dias (aceito); 1/10 a 2/1 = 94 (recusado)
    expect(code(() => cleanIndicatorQuery({ de: "2026-10-01", ate: "2027-01-01" }, null))).toBe("ok");
    expect(code(() => cleanIndicatorQuery({ de: "2026-10-01", ate: "2027-01-02" }, null))).toBe("400 ERR_API_PERIOD_TOO_LONG");
    expect(code(() => cleanIndicatorQuery({ de: "2026-11-02", ate: "2026-11-01" }, null))).toBe("400 ERR_INVALID_PERIOD");
    expect(code(() => cleanIndicatorQuery({ de: "2026-13-01", ate: "2026-13-02" }, null))).toBe("400 ERR_INVALID_PERIOD");
    expect(code(() => cleanIndicatorQuery({ ate: "2026-11-02" }, null))).toBe("400 ERR_INVALID_PERIOD");
    // dias que não existem não rolam para o mês seguinte
    for (const de of ["2026-02-31", "2026-02-29", "2026-04-31", "2026-00-10", "2026-11-00"]) expect(code(() => cleanIndicatorQuery({ de, ate: "2026-12-01" }, null))).toBe("400 ERR_INVALID_PERIOD");
    expect(code(() => cleanIndicatorQuery({ de: "2028-02-29", ate: "2028-03-01" }, null))).toBe("ok");
  });
  it("o polo pedido precisa ser um dos polos do token", () => {
    expect(cleanIndicatorQuery({ de: "2026-11-01", ate: "2026-11-02", polo: "3" }, [3, 4]).poloId).toBe(3);
    expect(code(() => cleanIndicatorQuery({ de: "2026-11-01", ate: "2026-11-02", polo: "5" }, [3, 4]))).toBe("403 ERR_API_TOKEN_POLO");
    expect(code(() => cleanIndicatorQuery({ de: "2026-11-01", ate: "2026-11-02", polo: "x" }, null))).toBe("400 ERR_INVALID_PARAMETER");
    expect(cleanIndicatorQuery({ de: "2026-11-01", ate: "2026-11-02", polo: "9" }, null).poloId).toBe(9);
  });
});

describe("consultor nos indicadores: código opaco por token", () => {
  it("o mesmo consultor tem o mesmo código no mesmo token, outro código em outro token, e nunca o id", async () => {
    const { consultantCode } = await import("../../src/services/IndicatorServices/IndicatorQuery");
    const a1 = consultantCode("token:1", 42, "segredo");
    expect(a1).toMatch(/^c_[0-9a-f]{10}$/);
    expect(consultantCode("token:1", 42, "segredo")).toBe(a1);
    expect(consultantCode("token:2", 42, "segredo")).not.toBe(a1);
    expect(consultantCode("token:1", 43, "segredo")).not.toBe(a1);
    expect(consultantCode("token:1", 42, "outro")).not.toBe(a1);
  });
});

describe("consultor nos indicadores: sem segredo, falha fechada", () => {
  const saved = { pseudo: process.env.API_PSEUDONYM_SECRET, jwt: process.env.JWT_SECRET };
  afterEach(() => {
    if (saved.pseudo === undefined) delete process.env.API_PSEUDONYM_SECRET; else process.env.API_PSEUDONYM_SECRET = saved.pseudo;
    if (saved.jwt === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = saved.jwt;
  });
  it("sem API_PSEUDONYM_SECRET nem JWT_SECRET, nenhum código é gerado (503) e a rota recusa antes de ler os números", async () => {
    const { consultantCode, assertPseudonymSecret, pseudonymSecret } = await import("../../src/services/IndicatorServices/IndicatorQuery");
    delete process.env.API_PSEUDONYM_SECRET;
    delete process.env.JWT_SECRET;
    expect(pseudonymSecret()).toBe("");
    expect(code(() => consultantCode("token:1", 42))).toBe("503 ERR_API_PSEUDONYM_SECRET_MISSING");
    expect(code(() => consultantCode("token:1", 42, ""))).toBe("503 ERR_API_PSEUDONYM_SECRET_MISSING");
    expect(code(() => consultantCode("token:1", 42, "   "))).toBe("503 ERR_API_PSEUDONYM_SECRET_MISSING");
    expect(code(() => assertPseudonymSecret())).toBe("503 ERR_API_PSEUDONYM_SECRET_MISSING");

    // a rota: recusa com o erro claro, sem chamar o cálculo
    const { indicators } = await import("../../src/controllers/ApiV1Controller");
    const req: any = { query: { de: "2026-11-01", ate: "2026-11-02" }, apiToken: { id: 1, scopes: ["indicators:read"], poloIds: null } };
    const res: any = { json: () => { throw new Error("a rota respondeu sem segredo"); } };
    await expect(indicators(req, res)).rejects.toMatchObject({ statusCode: 503, message: "ERR_API_PSEUDONYM_SECRET_MISSING" });
  });
  it("com o segredo próprio, ou só com o JWT_SECRET, o código sai e muda com o segredo", async () => {
    const { consultantCode } = await import("../../src/services/IndicatorServices/IndicatorQuery");
    delete process.env.API_PSEUDONYM_SECRET;
    process.env.JWT_SECRET = "jwt-de-teste";
    const viaJwt = consultantCode("token:1", 42);
    expect(viaJwt).toMatch(/^c_[0-9a-f]{10}$/);
    process.env.API_PSEUDONYM_SECRET = "segredo-proprio";
    const own = consultantCode("token:1", 42);
    expect(own).toMatch(/^c_[0-9a-f]{10}$/);
    expect(own).not.toBe(viaJwt);
  });
});
