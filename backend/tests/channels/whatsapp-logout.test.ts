import { describe, expect, it } from "vitest";

import { safeLogout } from "../../src/providers/WhatsApp/SafeLogout";

describe("desconectar um número por QR Code", () => {
  it("a saída do WhatsApp Web que quebra não impede de desconectar (antes: erro interno e o número continuava ligado)", async () => {
    let cleaned = 0;
    const logs: string[] = [];
    const broken = { logout: async () => { throw new TypeError("this.pupBrowser.isConnected is not a function"); } };
    await expect(safeLogout(broken, async () => { cleaned += 1; }, m => logs.push(m))).resolves.toBeUndefined();
    expect(cleaned).toBe(1);
    expect(logs[0]).toMatch(/isConnected/);
  });
  it("uma saída que não responde também termina, e sem sessão aberta só limpa", async () => {
    let cleaned = 0;
    await safeLogout({ logout: () => new Promise(() => undefined) }, async () => { cleaned += 1; }, () => undefined, 30);
    await safeLogout(null, async () => { cleaned += 1; });
    expect(cleaned).toBe(2);
  });
  it("a saída que funciona também limpa", async () => {
    let order: string[] = [];
    await safeLogout({ logout: async () => { order.push("logout"); } }, async () => { order.push("cleanup"); });
    expect(order).toEqual(["logout", "cleanup"]);
  });
});
