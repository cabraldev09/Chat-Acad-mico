// whatsapp-web.js (1.34.8, the latest stable) still calls browser.isConnected(), which puppeteer 25 removed (it is the `connected` property
// now). Without it the logout threw "isConnected is not a function" (the button "desconectar" answered "erro interno") and destroy() never
// closed the browser (it checks isConnected?.(), always undefined), leaving Chromium processes behind. Giving the method back, read from
// `connected`, fixes both in the library itself. Only added when missing: a puppeteer that has it is left alone.
export const patchBrowserIsConnected = (Browser: any): boolean => {
  const proto = Browser && Browser.prototype;
  if (!proto || typeof proto.isConnected === "function") return false;
  Object.defineProperty(proto, "isConnected", {
    configurable: true,
    writable: true,
    value: function isConnected(this: any): boolean {
      return !!this.connected;
    }
  });
  return true;
};

export const applyPuppeteerCompat = (): void => {
  try {
    // eslint-disable-next-line global-require, @typescript-eslint/no-var-requires
    patchBrowserIsConnected(require("puppeteer").Browser);
  } catch (_) {
    // no puppeteer installed (tests, the official API only): nothing to patch
  }
};
