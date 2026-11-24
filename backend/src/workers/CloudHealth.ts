import axios from "axios";

import { GRAPH } from "../channels/meta";
import { getConfig } from "../channels/types";
import { expiryNote } from "../services/ChannelServices/CloudToken";
import { getIO } from "../libs/socket";
import Whatsapp from "../models/Whatsapp";
import { logger } from "../utils/logger";

const QUALITY: Record<string, string> = {
  GREEN: "",
  YELLOW: "Qualidade do número em atenção (amarela) na Meta: muitas pessoas bloquearam ou denunciaram mensagens recentes.",
  RED: "Qualidade do número baixa (vermelha) na Meta: o limite de conversas pode cair. Reduza disparos e mensagens frias."
};

// What the person must do, in Portuguese, for the refusals of the Meta seen when a number is read
export const cloudErrorNote = (meta: { code?: number; message?: string } = {}, http?: number): string => {
  const msg = String(meta.message || "");
  if (meta.code === 190 && /cannot parse/i.test(msg))
    return "O token de acesso não é um token válido da Meta (foi colado incompleto ou é outro valor, como o App Secret). Copie de novo o token permanente do usuário do sistema (começa com EAA) e salve na conexão.";
  if (meta.code === 190)
    return "O token de acesso da Meta expirou ou foi revogado: gere um token permanente (usuário do sistema) e salve na conexão.";
  if (meta.code === 100 || meta.code === 10 || meta.code === 200)
    return "A Meta não deixa este token ler o número: confira o Phone Number ID e, no Business Manager, atribua a conta do WhatsApp (WABA) ao usuário do sistema com controle total.";
  return `A Meta recusou a consulta do número: ${msg || `HTTP ${http || "?"}`}`;
};

// The official numbers (Cloud API) do not "disconnect" like a QR code: the token expires, a permission is removed or the number is
// blocked, and nothing tells the system until a message fails. Every few minutes each number is read on the Meta and the connection shows
// what is wrong (status and note) and the quality of the number. A network failure or an error of the Meta itself changes nothing.
export const checkCloudConnection = async (whatsapp: Whatsapp, starting = false): Promise<string> => {
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
      note = expiryNote(getConfig(whatsapp).tokenExpiresAt) || getConfig(whatsapp).tokenExtendError || QUALITY[String(data.quality_rating || "GREEN").toUpperCase()] || "";
      if (data.display_phone_number && whatsapp.session !== data.display_phone_number) await whatsapp.update({ session: data.display_phone_number });
    } catch (err: any) {
      const http = err?.response?.status;
      // only the Meta refusing the token or the number says the connection is broken; a timeout or a 5xx is checked again next time
      if ((!http || http >= 500) && !starting) return whatsapp.status;
      if (!http || http >= 500) {
        // connecting now and the Meta did not answer: the connection is not up, and the screen says why ("Tentar novamente" asks again)
        status = "DISCONNECTED";
        note = "A Meta não respondeu agora. Clique em Tentar novamente em alguns minutos.";
        await whatsapp.update({ status, statusNote: note, qrcode: "" } as any);
        getIO().emit("whatsappSession", { action: "update", session: whatsapp });
        return status;
      }
      const meta = err?.response?.data?.error || {};
      status = "DISCONNECTED";
      note = cloudErrorNote(meta, http);
      // what was saved, without showing it: a Meta token starts with EAA and is long
      if (meta.code === 190) note += ` (O token salvo começa com "${String(accessToken).slice(0, 3)}" e tem ${String(accessToken).length} caracteres; o da Meta começa com EAA e passa de 100.)`;
    }
  }
  if (whatsapp.status !== status || (whatsapp.statusNote || "") !== note) {
    await whatsapp.update({ status, statusNote: note || null, qrcode: "" } as any);
    getIO().emit("whatsappSession", { action: "update", session: whatsapp });
  }
  return status;
};

// The official number must not go down unnoticed: when it disconnects, or its token is about to end, the administrators get an
// e-mail (at most once every 6 hours per number), besides the notice on the screen.
const lastAlert = new Map<string, number>();
const ALERT_EVERY_MS = 6 * 3600000;
// topic: the kind of problem. Each one has its own clock (a "sending paused" e-mail no longer hides a "disconnected" one for 6 hours).
export const alertAdmins = async (w: Whatsapp, reason: string, topic: "health" | "watchdog" | "safety" = "health"): Promise<boolean> => {
  // kept in the settings too: a restart of the server (a deploy) does not send the same e-mail again
  const { getSetting, setSetting } = await import("../helpers/AppSettings");
  const key = topic === "health" ? `cloud_alert_at_${w.id}` : `cloud_alert_${topic}_at_${w.id}`;
  const memo = `${topic}:${w.id}`;
  const last = Math.max(lastAlert.get(memo) || 0, Number(await getSetting(key, "0")) || 0);
  if (Date.now() - last < ALERT_EVERY_MS) return false;
  lastAlert.set(memo, Date.now());
  await setSetting(key, String(Date.now())).catch(() => undefined);
  const User = (await import("../models/User")).default;
  const { notify, frontBase } = await import("../services/MailServices/Notify");
  // the administration and the coordination (the coordination has the same powers and also runs the numbers)
  const { Op } = await import("sequelize");
  const admins = await User.findAll({ where: { [Op.or]: [{ profile: "admin" }, { role: { [Op.in]: ["admin", "coordenacao"] } }] } as any, attributes: ["id", "email"] });
  const link = `${frontBase()}/connections`;
  const kind = w.channel === "whatsapp_cloud" ? "WhatsApp oficial" : "WhatsApp";
  const subject = `${kind} "${w.name}": ${w.status === "CONNECTED" ? "atenção" : "fora do ar"}`;
  const text = `${reason}\n\nAbra Conexões para resolver: ${link}`;
  const html = `<p>${reason.replace(/</g, "&lt;")}</p><p><a href="${link}">Abrir Conexões</a></p>`;
  admins.forEach(a => notify(a.email, { subject, text, html }, "Cloud health alert"));
  const { notify: notice } = await import("../services/NotificationServices/Notify");
  await notice(admins.map(a => a.id), { kind: `connection_${topic}`, level: w.status === "CONNECTED" ? "warning" : "urgent", title: subject, body: reason.slice(0, 300), link: "/connections", dedupeKey: `connection:${topic}:${w.id}:${new Date().toISOString().slice(0, 13)}` });
  return true;
};

const tick = async (): Promise<void> => {
  try {
    const numbers = await Whatsapp.findAll({ where: { channel: "whatsapp_cloud" } as any });
    for (const w of numbers) {
      try {
        // a token close to its end is traded again before it stops (only when the App ID and the App Secret allow it)
        const { tokenExpiresAt } = getConfig(w);
        if (tokenExpiresAt && new Date(tokenExpiresAt).getTime() - Date.now() < 7 * 86400000) {
          const { extendCloudToken } = await import("../services/ChannelServices/CloudToken");
          // eslint-disable-next-line no-await-in-loop
          await extendCloudToken(w);
        }
        const tokens = await import("../services/ChannelServices/CloudToken");
        // a number saved without the App ID / App Secret takes the ones of its app from another number, so its token is renewed in time
        // eslint-disable-next-line no-await-in-loop
        if (await tokens.adoptSiblingApp(w).catch(() => false)) { await w.reload(); await tokens.extendCloudToken(w).catch(() => undefined); await w.reload(); }
        // eslint-disable-next-line no-await-in-loop
        let status = await checkCloudConnection(w);
        // the token was refused (expired or revoked): the access of another official number of the same account brings it back at once
        if (status !== "CONNECTED" && /token de acesso/i.test(String(w.statusNote || ""))) {
          // eslint-disable-next-line no-await-in-loop
          const from = await tokens.borrowSiblingToken(w).catch(() => null);
          if (from) {
            await w.reload();
            // eslint-disable-next-line no-await-in-loop
            status = await checkCloudConnection(w);
            if (status === "CONNECTED") await alertAdmins(w, `O número oficial "${w.name}" ficou sem acesso (o token expirou ou foi revogado) e voltou sozinho com o acesso do número "${from.name}". Nenhuma ação é necessária; para deixar cada número independente, salve nele um token permanente de usuário do sistema.`, "watchdog");
          }
        }
        const expiring = getConfig(w).tokenExpiresAt && new Date(getConfig(w).tokenExpiresAt).getTime() - Date.now() < 2 * 86400000;
        if (status !== "CONNECTED") await alertAdmins(w, `O número oficial "${w.name}" está desconectado. ${w.statusNote || ""}`.trim());
        else if (expiring) await alertAdmins(w, `O token de acesso do número oficial "${w.name}" vence em menos de 2 dias. Gere um token novo e cole na conexão para o número não cair.`);
      } catch (err) {
        logger.warn(`Cloud health of connection ${w.id} failed: ${err}`);
      }
    }
  } catch (err) {
    logger.warn(`Cloud health tick failed: ${err}`);
  }
};

export const startCloudHealth = (): void => {
  setInterval(tick, Number(process.env.CLOUD_HEALTH_MS) || 10 * 60000);
  // right after a restart (a deploy) the numbers are checked and healed in a minute, not in ten
  if (process.env.NODE_ENV !== "test") setTimeout(tick, 60000);
};

export { tick as runCloudHealthOnce };
