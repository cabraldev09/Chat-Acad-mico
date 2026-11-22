import { afterEach, describe, expect, it, vi } from "vitest";
import { verify } from "jsonwebtoken";

vi.mock("../../src/config/auth", () => ({ default: { secret: "test-secret" } }));

import { signedFileUrl, verifyFileToken } from "../../src/helpers/SignedFile";
import { cachedSetting, forgetSettings, rememberSetting } from "../../src/helpers/SettingsCache";

describe("link de arquivo estável", () => {
  it("o mesmo arquivo tem o mesmo link durante a hora (o navegador não baixa de novo) e o link continua válido", () => {
    const t0 = Date.UTC(2026, 10, 22, 10, 5, 0);
    const a = signedFileUrl("foto.jpg", "m1", t0);
    const b = signedFileUrl("foto.jpg", "m1", t0 + 40 * 60 * 1000);
    expect(a).toBe(b);
    const c = signedFileUrl("foto.jpg", "m1", t0 + 60 * 60 * 1000);
    expect(c).not.toBe(a);
    const token = decodeURIComponent(a.split("access=")[1]);
    const claims = verify(token, "test-secret", { algorithms: ["HS256"], clockTimestamp: Math.floor(t0 / 1000) }) as any;
    expect(claims.exp - Math.floor(t0 / 1000)).toBeGreaterThanOrEqual(3600);
  });
  it("o token só abre o arquivo para o qual foi feito", () => {
    const url = signedFileUrl("a.pdf", undefined);
    const token = decodeURIComponent(url.split("access=")[1]);
    expect(verifyFileToken(token, "a.pdf").file).toBe("a.pdf");
    expect(() => verifyFileToken(token, "b.pdf")).toThrow();
  });
});

describe("configurações em memória", () => {
  afterEach(() => { delete process.env.SETTINGS_CACHE_MS; forgetSettings(); });
  it("guarda o valor (inclusive a ausência) e esquece tudo ao mudar, também depois do commit da transação", () => {
    rememberSetting("x", "1");
    rememberSetting("y", null);
    expect(cachedSetting("x")).toEqual({ hit: true, value: "1" });
    expect(cachedSetting("y")).toEqual({ hit: true, value: null });
    const later: Array<() => void> = [];
    forgetSettings({ transaction: { afterCommit: (fn: () => void) => later.push(fn) } });
    expect(cachedSetting("x").hit).toBe(false);
    rememberSetting("x", "velho");
    later.forEach(fn => fn());
    expect(cachedSetting("x").hit).toBe(false);
  });
  it("SETTINGS_CACHE_MS=0 desliga a memória", () => {
    process.env.SETTINGS_CACHE_MS = "0";
    rememberSetting("x", "1");
    expect(cachedSetting("x").hit).toBe(false);
  });
});
