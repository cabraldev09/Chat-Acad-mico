import axios from "axios";

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

const saveConfig = async (whatsapp: Whatsapp, changes: Record<string, any>): Promise<void> => {
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
  const { accessToken, appId, appSecret, tokenExpiresAt } = getConfig(whatsapp);
  if (!accessToken || !appId || !appSecret) return "skipped";
  const appToken = `${String(appId).trim()}|${appSecret}`;
  try {
    const expires = await expiresOf(accessToken, appToken);
    if (expires === null) return "skipped";
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
    logger.warn(`WhatsApp Cloud ${whatsapp.id}: token não estendido (${err?.response?.data?.error?.message || err?.message || err})`);
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
