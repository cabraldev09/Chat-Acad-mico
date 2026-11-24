import axios from "axios";
import { randomBytes } from "crypto";

import Whatsapp from "../../models/Whatsapp";
import { GRAPH } from "../../channels/meta";
import { getConfig } from "../../channels/types";
import { sealConfig } from "../../helpers/Secrets";
import { logger } from "../../utils/logger";

// The permanent token of a system user is the right one for an official number, but the Meta does not always let a person create it.
// The token of the "API setup" screen lasts 24 hours. With the App ID and the App Secret of the connection, the Meta trades it for one that
// lasts 60 days (fb_exchange_token); its validity is read on the Meta (debug_token) and kept in tokenExpiresAt, so the screen and the
// health check say when it ends. A permanent token (expires_at = 0) is kept as it is.
const LONG_ENOUGH_MS = 7 * 86400000;

export const saveConfig = async (whatsapp: Whatsapp, changes: Record<string, any>): Promise<void> => {
  const stored = JSON.parse((whatsapp.config as string) || "{}");
  await whatsapp.update({ config: sealConfig(JSON.stringify({ ...stored, ...changes })) as string });
};

const expiresOf = async (token: string, appToken: string): Promise<number | null> => {
  const { data } = await axios.get(`${GRAPH}/debug_token`, { params: { input_token: token, access_token: appToken }, timeout: 15000 });
  const info = data?.data || {};
  if (info.is_valid === false) return null;
  return Number(info.expires_at || 0) * 1000;
};

export const extendCloudToken = async (whatsapp: Whatsapp): Promise<"permanent" | "extended" | "kept" | "skipped"> => {
  const { accessToken, appId, appSecret, tokenExpiresAt, tokenExtendError } = getConfig(whatsapp);
  if (!accessToken || !appId || !appSecret) return "skipped";
  const appToken = `${String(appId).trim()}|${appSecret}`;
  try {
    const expires = await expiresOf(accessToken, appToken);
    if (expires === null) return "skipped";
    if (tokenExtendError) await saveConfig(whatsapp, { tokenExtendError: null });
    if (expires === 0) {
      if (tokenExpiresAt) await saveConfig(whatsapp, { tokenExpiresAt: null });
      return "permanent";
    }
    if (expires - Date.now() > LONG_ENOUGH_MS) {
      const iso = new Date(expires).toISOString();
      if (iso !== tokenExpiresAt) await saveConfig(whatsapp, { tokenExpiresAt: iso });
      return "kept";
    }
    const { data } = await axios.get(`${GRAPH}/oauth/access_token`, {
      params: { grant_type: "fb_exchange_token", client_id: String(appId).trim(), client_secret: appSecret, fb_exchange_token: accessToken },
      timeout: 20000
    });
    if (!data?.access_token) return "skipped";
    const next = (await expiresOf(data.access_token, appToken).catch(() => null)) || Date.now() + Number(data.expires_in || 5184000) * 1000;
    await saveConfig(whatsapp, { accessToken: data.access_token, tokenExpiresAt: new Date(next).toISOString() });
    logger.info(`WhatsApp Cloud ${whatsapp.id}: token trocado por um que vale até ${new Date(next).toISOString()}`);
    return "extended";
  } catch (err: any) {
    // a wrong App ID or App Secret only means the token is not extended; the connection check that follows says what is wrong with it
    const message = String(err?.response?.data?.error?.message || err?.message || err);
    logger.warn(`WhatsApp Cloud ${whatsapp.id}: token não estendido (${message})`);
    // the Meta refused the App ID / App Secret pair: the connection keeps working, and the screen says why the token stays short
    if (err?.response?.status && err.response.status < 500) {
      await saveConfig(whatsapp, { tokenExtendError: /signature|client_secret|app secret|appsecret/i.test(message)
        ? "O token é de 24 horas: o App ID e o App Secret salvos são de apps diferentes. Use os dois do mesmo app (o que recebe o webhook) para ele valer 60 dias."
        : `O token não foi trocado por um de 60 dias: ${message}` }).catch(() => undefined);
    }
    return "skipped";
  }
};

// the note shown on the connection in the last days of a token that expires
export const expiryNote = (tokenExpiresAt?: string | null, now = Date.now()): string => {
  if (!tokenExpiresAt) return "";
  const left = Math.ceil((new Date(tokenExpiresAt).getTime() - now) / 86400000);
  if (left > 7) return "";
  if (left <= 0) return "O token de acesso venceu: gere um novo (Configuração da API do app ou usuário do sistema) e cole na conexão.";
  return `O token de acesso vence em ${left} dia${left > 1 ? "s" : ""}: gere um novo (Configuração da API do app ou usuário do sistema) e cole na conexão.`;
};

// the Verify Token of the webhook is created by the server (nobody has to invent one) and shown next to the webhook URL
export const ensureVerifyToken = async (whatsapp: Whatsapp): Promise<void> => {
  if (getConfig(whatsapp).verifyToken) return;
  await saveConfig(whatsapp, { verifyToken: `chat-${randomBytes(12).toString("hex")}` });
};

// ---------------------------------------------------------------- an official number that does not go down
// Two official numbers of the same company on the Meta (Atendimento and Tutoria) can use the same access: the token of a system user,
// or of the person who manages the WhatsApp account, reaches every number of the account. So a number whose token expired or was revoked
// is brought back with the token of another official number, when the Meta says that token can read this number. And a number saved
// without the App ID / App Secret gets the ones of another number of the same app, so its token is renewed before it ends.
// Nothing here shows or logs a token: only the names of the connections.

const canRead = async (phoneNumberId: string, token: string): Promise<boolean> => {
  try {
    const { data } = await axios.get(`${GRAPH}/${phoneNumberId}`, { params: { access_token: token, fields: "display_phone_number" }, timeout: 15000 });
    return !!data?.display_phone_number;
  } catch (e) { return false; }
};

export const borrowSiblingToken = async (whatsapp: Whatsapp): Promise<Whatsapp | null> => {
  const { phoneNumberId, accessToken } = getConfig(whatsapp);
  if (!phoneNumberId) return null;
  const siblings = await Whatsapp.findAll({ where: { channel: "whatsapp_cloud" } as any, order: [["id", "ASC"]] });
  for (const s of siblings) {
    if (s.id === whatsapp.id || s.status !== "CONNECTED") continue;
    const sc = getConfig(s);
    if (!sc.accessToken || sc.accessToken === accessToken) continue;
    // eslint-disable-next-line no-await-in-loop
    if (!(await canRead(String(phoneNumberId), sc.accessToken))) continue;
    const mine = getConfig(whatsapp);
    await saveConfig(whatsapp, {
      accessToken: sc.accessToken,
      tokenExpiresAt: sc.tokenExpiresAt || null,
      tokenExtendError: null,
      tokenFrom: s.id,
      // the app of the token comes with it, so the renewal works here too
      ...(!mine.appId || !mine.appSecret ? { appId: sc.appId || mine.appId, appSecret: sc.appSecret || mine.appSecret } : {})
    });
    logger.info(`WhatsApp Cloud ${whatsapp.id}: reconectado com o acesso da conexão ${s.id}`);
    return s;
  }
  return null;
};

// a number without the App ID / App Secret: the ones of another official number whose app issued this token
export const adoptSiblingApp = async (whatsapp: Whatsapp): Promise<boolean> => {
  const mine = getConfig(whatsapp);
  if (!mine.accessToken || (mine.appId && mine.appSecret)) return false;
  const siblings = await Whatsapp.findAll({ where: { channel: "whatsapp_cloud" } as any, order: [["id", "ASC"]] });
  for (const s of siblings) {
    const sc = getConfig(s);
    if (s.id === whatsapp.id || !sc.appId || !sc.appSecret) continue;
    try {
      // eslint-disable-next-line no-await-in-loop
      const { data } = await axios.get(`${GRAPH}/debug_token`, { params: { input_token: mine.accessToken, access_token: `${String(sc.appId).trim()}|${sc.appSecret}` }, timeout: 15000 });
      if (data?.data?.is_valid !== false && String(data?.data?.app_id || "") === String(sc.appId).trim()) {
        await saveConfig(whatsapp, { appId: sc.appId, appSecret: sc.appSecret });
        return true;
      }
    } catch (e) { /* another app: try the next one */ }
  }
  return false;
};
