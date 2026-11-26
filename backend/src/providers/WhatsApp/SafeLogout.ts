// "desconectar" a number by QR Code: asks WhatsApp to drop the device, but never depends on it. whatsapp-web.js' logout breaks on its own
// (it calls pupBrowser.isConnected, which the puppeteer installed no longer has; a page already detached throws "detached Frame") or
// hangs; whatever happens, the cleanup runs (close the browser, put the saved login aside, mark the number disconnected).
export const safeLogout = async (
  wbot: { logout: () => Promise<any> } | null,
  cleanup: () => Promise<void>,
  log: (m: string) => void = () => undefined,
  timeoutMs = 20000
): Promise<void> => {
  if (wbot) {
    try {
      await Promise.race([
        Promise.resolve().then(() => wbot.logout()),
        new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), timeoutMs))
      ]);
    } catch (err) {
      log(`a saída pelo WhatsApp Web falhou (${(err as Error).message}); o navegador é fechado e o login salvo posto de lado`);
    }
  }
  await cleanup();
};
