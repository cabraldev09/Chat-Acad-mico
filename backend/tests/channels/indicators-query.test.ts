import { describe, expect, it } from "vitest";

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
