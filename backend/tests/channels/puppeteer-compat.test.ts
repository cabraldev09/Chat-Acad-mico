import { describe, expect, it } from "vitest";

import { patchBrowserIsConnected } from "../../src/providers/WhatsApp/PuppeteerCompat";

describe("navegador do WhatsApp por QR Code com o puppeteer 25", () => {
  it("o puppeteer instalado não tem mais isConnected(), que o whatsapp-web.js usa ao desconectar e ao fechar", () => {
    // eslint-disable-next-line global-require, @typescript-eslint/no-var-requires
    const { Browser } = require("puppeteer");
    const had = typeof Browser.prototype.isConnected === "function";
    patchBrowserIsConnected(Browser);
    expect(typeof Browser.prototype.isConnected).toBe("function");
    // antes da correção não existia (é a causa do "erro interno" ao desconectar)
    expect(had || patchBrowserIsConnected(Browser) === false).toBe(true);
  });
  it("isConnected() responde o que a propriedade connected diz", () => {
    class FakeBrowser { connected = true; }
    expect(patchBrowserIsConnected(FakeBrowser)).toBe(true);
    const b: any = new FakeBrowser();
    expect(b.isConnected()).toBe(true);
    b.connected = false;
    expect(b.isConnected()).toBe(false);
  });
  it("um navegador que já tem o método fica como está", () => {
    class Old { isConnected() { return "original"; } }
    expect(patchBrowserIsConnected(Old)).toBe(false);
    expect((new Old() as any).isConnected()).toBe("original");
  });
});
