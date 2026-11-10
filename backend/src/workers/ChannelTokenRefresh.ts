import axios from "axios";

import Whatsapp from "../models/Whatsapp";
import { getConfig } from "../channels/types";
import { IG_GRAPH } from "../helpers/MetaApp";
import { sealConfig } from "../helpers/Secrets";
import { setChannelStatus } from "../services/ChannelServices/ChannelStatus";
import { logger } from "../utils/logger";

// The Instagram login gives a token that lasts 60 days. This keeps it alive and watches the connection:
//   - a token that expires in 10 days or less is renewed (Instagram only renews tokens older than 24 h);
//   - the account is asked for its profile: if Instagram refuses (password changed, access removed, token expired) the connection shows as
//     disconnected, and the existing alert tells the owner to log in again; when it answers again it shows as connected.
const RENEW_WITHIN_DAYS = 10;

const reason = (err: any): string => err?.response?.data?.error?.message || err?.message || String(err);

// the token is refused for good (not just a network failure)
const isRefused = (err: any): boolean => {
  return err?.response?.data?.error?.code === 190 || err?.response?.status === 401;
};

export const refreshOne = async (w: Whatsapp): Promise<"ok" | "renewed" | "refused" | "error"> => {
  const config = getConfig(w);
  if (config.mode !== "oauth" || !config.accessToken) return "ok";
  let renewed = false;
  try {
    const expires = config.tokenExpiresAt ? new Date(config.tokenExpiresAt).getTime() : 0;
    if (!expires || expires - Date.now() < RENEW_WITHIN_DAYS * 86400000) {
      const { data } = await axios.get(`${IG_GRAPH}/refresh_access_token`, {
        params: { grant_type: "ig_refresh_token", access_token: config.accessToken },
        timeout: 20000
      });
      if (data.access_token) {
        const next = { ...JSON.parse(w.config as string), accessToken: data.access_token, tokenExpiresAt: new Date(Date.now() + Number(data.expires_in || 5184000) * 1000).toISOString() };
        await w.update({ config: sealConfig(JSON.stringify(next)) as string });
        renewed = true;
      }
    }
    // the profile answers: the account is still connected
    await axios.get(`${IG_GRAPH}/me`, { params: { fields: "user_id", access_token: getConfig(w).accessToken }, timeout: 15000 });
    if (w.status !== "CONNECTED") await setChannelStatus(w, "CONNECTED");
    return renewed ? "renewed" : "ok";
  } catch (err) {
    if (isRefused(err)) {
      logger.warn(`Instagram ${w.name}: acesso recusado (${reason(err)}). Precisa entrar de novo.`);
      if (w.status !== "DISCONNECTED") await setChannelStatus(w, "DISCONNECTED");
      return "refused";
    }
    logger.warn(`Instagram ${w.name}: não foi possível conferir agora (${reason(err)}).`);
    return "error";
  }
};

export const tick = async (): Promise<void> => {
  try {
    const rows = await Whatsapp.findAll({ where: { channel: "instagram" } as any });
    for (const w of rows) {
      // eslint-disable-next-line no-await-in-loop
      await refreshOne(w);
    }
  } catch (err) {
    logger.warn(`Instagram token worker failed: ${err}`);
  }
};

export const startChannelTokenRefresh = (): void => {
  setInterval(tick, Number(process.env.CHANNEL_TOKEN_REFRESH_MS) || 6 * 3600000);
  // first look shortly after the server starts, so a token that expired while it was off shows up
  setTimeout(tick, Number(process.env.CHANNEL_TOKEN_FIRST_MS) || 60000);
};
