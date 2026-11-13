import axios from "axios";

import { GRAPH } from "../channels/meta";
import { getConfig } from "../channels/types";
import { getIO } from "../libs/socket";
import Whatsapp from "../models/Whatsapp";
import { logger } from "../utils/logger";

const QUALITY: Record<string, string> = {
  GREEN: "",
  YELLOW: "Qualidade do número em atenção (amarela) na Meta: muitas pessoas bloquearam ou denunciaram mensagens recentes.",
  RED: "Qualidade do número baixa (vermelha) na Meta: o limite de conversas pode cair. Reduza disparos e mensagens frias."
};

// The official numbers (Cloud API) do not "disconnect" like a QR code: the token expires, a permission is removed or the number is
// blocked, and nothing tells the system until a message fails. Every few minutes each number is read on the Meta and the connection shows
// what is wrong (status and note) and the quality of the number. A network failure or an error of the Meta itself changes nothing.
export const checkCloudConnection = async (whatsapp: Whatsapp): Promise<string> => {
  const { accessToken, phoneNumberId } = getConfig(whatsapp);
  let status = "CONNECTED";
  let note = "";
  if (!accessToken || !phoneNumberId) {
    status = "DISCONNECTED";
    note = "Faltam o token de acesso ou o Phone Number ID da Meta nesta conexão.";
  } else {
    try {
      const { data } = await axios.get(`${GRAPH}/${phoneNumberId}`, {
        params: { access_token: accessToken, fields: "display_phone_number,verified_name,quality_rating" },
        timeout: 15000
      });
      note = QUALITY[String(data.quality_rating || "GREEN").toUpperCase()] || "";
      if (data.display_phone_number && whatsapp.session !== data.display_phone_number) await whatsapp.update({ session: data.display_phone_number });
    } catch (err: any) {
      const http = err?.response?.status;
      // only the Meta refusing the token or the number says the connection is broken; a timeout or a 5xx is checked again next time
      if (!http || http >= 500) return whatsapp.status;
      const meta = err?.response?.data?.error || {};
      status = "DISCONNECTED";
      note = meta.code === 190
        ? "O token de acesso da Meta expirou ou foi revogado: gere um token permanente (usuário do sistema) e salve na conexão."
        : `A Meta recusou a consulta do número: ${meta.message || `HTTP ${http}`}`;
    }
  }
  if (whatsapp.status !== status || (whatsapp.statusNote || "") !== note) {
    await whatsapp.update({ status, statusNote: note || null, qrcode: "" } as any);
    getIO().emit("whatsappSession", { action: "update", session: whatsapp });
  }
  return status;
};

const tick = async (): Promise<void> => {
  try {
    const numbers = await Whatsapp.findAll({ where: { channel: "whatsapp_cloud" } as any });
    for (const w of numbers) {
      // eslint-disable-next-line no-await-in-loop
      await checkCloudConnection(w).catch(err => logger.warn(`Cloud health of connection ${w.id} failed: ${err}`));
    }
  } catch (err) {
    logger.warn(`Cloud health tick failed: ${err}`);
  }
};

export const startCloudHealth = (): void => {
  setInterval(tick, Number(process.env.CLOUD_HEALTH_MS) || 10 * 60000);
};

export { tick as runCloudHealthOnce };
