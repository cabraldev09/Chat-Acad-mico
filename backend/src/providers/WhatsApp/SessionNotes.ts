import fs from "fs";
import path from "path";

// What the screen of Conexões says about a WhatsApp number that is not connected, and the small decisions behind it (pure, so they are tested
// without a browser).

// What a disconnection means, in words for the person
export const disconnectNote = (reason: string): string => {
  const r = String(reason || "");
  if (isLogoutReason(r)) return "O WhatsApp do celular desconectou este aparelho (ou recusou a conexão). Clique em QR CODE e leia o código de novo.";
  if (/max qrcode/i.test(r)) return "O QR Code expirou sem ser lido. Clique em QR CODE para gerar outro.";
  if (/CONFLICT/i.test(r)) return "O WhatsApp foi aberto em outro computador e derrubou esta conexão; reconectando.";
  if (/TIMEOUT/i.test(r)) return "O celular ficou sem responder; reconectando.";
  return `Desconectou (${r || "sem motivo informado"}); reconectando.`;
};

// WhatsApp itself unlinked this device: the saved login is dead
export function isLogoutReason(reason: string): boolean {
  return /^(LOGOUT|UNPAIRED|UNPAIRED_IDLE)$/i.test(String(reason || ""));
}

// A QR Code that stops renewing (the page lost its connection to WhatsApp and stays on "abrindo") can no longer be read: the phone keeps "loading"
// and never connects while the screen still shows it. Older than this (the pairing code renews every 150 s) it is dead.
export const QR_STALE_MS = Number(process.env.WHATSAPP_QR_STALE_MS) || 4 * 60 * 1000;
export const qrIsStale = (o: { lastQrAt?: number; ready: boolean; authenticated: boolean; now: number; staleMs?: number }): boolean =>
  !o.ready && !o.authenticated && !!o.lastQrAt && o.now - o.lastQrAt > (o.staleMs ?? QR_STALE_MS);

// The saved login of a number that WhatsApp logged out only keeps the page trying to resume it: it is moved aside (only the last copy is kept,
// for a look) so the next start shows a fresh QR Code
export const setAsideLoginIn = (dir: string, whatsappId: number, why: string, log: (m: string) => void = () => undefined): boolean => {
  const profile = path.join(dir, `session-bd_${whatsappId}`);
  try {
    if (!fs.existsSync(profile)) return false;
    fs.readdirSync(dir)
      .filter(n => n.startsWith(`session-bd_${whatsappId}.descartada-`))
      .forEach(n => fs.rmSync(path.join(dir, n), { recursive: true, force: true }));
    const stamp = new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
    fs.renameSync(profile, `${profile}.descartada-${stamp}`);
    log(`Session ${whatsappId}: login salvo posto de lado (${why}); o próximo início mostra um QR Code novo`);
    return true;
  } catch (err) {
    log(`Session ${whatsappId}: não deu para pôr de lado o login salvo: ${err}`);
    return false;
  }
};
