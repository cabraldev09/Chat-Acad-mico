import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";

import { disconnectNote, isLogoutReason, qrIsStale, setAsideLoginIn } from "../../src/providers/WhatsApp/SessionNotes";

describe("conexão por QR Code: o que a tela diz e quando reabrir", () => {
  it("explica cada desconexão em palavras", () => {
    expect(disconnectNote("LOGOUT")).toMatch(/celular desconectou este aparelho/);
    expect(disconnectNote("Max qrcode retries reached")).toMatch(/QR Code expirou/);
    expect(disconnectNote("CONFLICT")).toMatch(/outro computador/);
    expect(disconnectNote("NAVIGATION")).toMatch(/Desconectou \(NAVIGATION\)/);
    expect(isLogoutReason("LOGOUT")).toBe(true);
    expect(isLogoutReason("UNPAIRED_IDLE")).toBe(true);
    expect(isLogoutReason("CONFLICT")).toBe(false);
  });

  it("o QR Code que parou de se renovar está morto; esperando leitura, lido ou pronto não está", () => {
    const now = 10 * 60000;
    expect(qrIsStale({ lastQrAt: now - 5 * 60000, ready: false, authenticated: false, now, staleMs: 4 * 60000 })).toBe(true);
    expect(qrIsStale({ lastQrAt: now - 60000, ready: false, authenticated: false, now, staleMs: 4 * 60000 })).toBe(false);
    expect(qrIsStale({ lastQrAt: now - 5 * 60000, ready: false, authenticated: true, now, staleMs: 4 * 60000 })).toBe(false);
    expect(qrIsStale({ lastQrAt: now - 5 * 60000, ready: true, authenticated: false, now, staleMs: 4 * 60000 })).toBe(false);
    expect(qrIsStale({ lastQrAt: undefined, ready: false, authenticated: false, now, staleMs: 4 * 60000 })).toBe(false);
  });

  it("o login recusado pelo WhatsApp é posto de lado (só a última cópia fica)", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wwebjs-"));
    fs.mkdirSync(path.join(dir, "session-bd_2", "Default"), { recursive: true });
    fs.mkdirSync(path.join(dir, "session-bd_2.descartada-20260101000000"));
    fs.mkdirSync(path.join(dir, "session-bd_5", "Default"), { recursive: true });
    expect(setAsideLoginIn(dir, 2, "teste")).toBe(true);
    const names = fs.readdirSync(dir).sort();
    expect(names.filter(n => n.startsWith("session-bd_2"))).toHaveLength(1);
    expect(names.some(n => /^session-bd_2\.descartada-\d{14}$/.test(n))).toBe(true);
    expect(names).toContain("session-bd_5");
    expect(setAsideLoginIn(dir, 2, "de novo")).toBe(false);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
