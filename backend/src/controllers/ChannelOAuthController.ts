import { Request, Response } from "express";
import axios from "axios";

import AppError from "../errors/AppError";
import Whatsapp from "../models/Whatsapp";
import User from "../models/User";
import { getSetting } from "../helpers/AppSettings";
import { isManagerRole, roleOf } from "../helpers/Roles";
import { maskSecret, isMasked, sealConfig } from "../helpers/Secrets";
import { getConfig } from "../channels/types";
import { setChannelStatus } from "../services/ChannelServices/ChannelStatus";
import CreateWhatsAppService from "../services/WhatsappService/CreateWhatsAppService";
import { frontBase } from "../services/MailServices/Notify";
import { getIO } from "../libs/socket";
import { logger } from "../utils/logger";
import {
  IG_AUTH_URL,
  IG_GRAPH,
  IG_SCOPES,
  IG_TOKEN_URL,
  appWebhookUrl,
  getMetaApp,
  instagramRedirectUri,
  isMetaAppReady,
  readState,
  saveMetaApp,
  signState
} from "../helpers/MetaApp";

const isManagerReq = (req: Request): boolean => isManagerRole(roleOf(req.user));

const providerReason = (err: any): string =>
  err?.response?.data?.error_message || err?.response?.data?.error?.message || err?.message || "falha desconhecida";

// ------------------------------------------------------------------ the Meta app (once per installation)
const appView = async () => {
  const app = await getMetaApp();
  return {
    appId: app.appId,
    appSecret: maskSecret(app.appSecret) || "",
    verifyToken: app.verifyToken,
    configured: isMetaAppReady(app),
    redirectUri: instagramRedirectUri(),
    webhookUrl: appWebhookUrl(),
    scopes: IG_SCOPES,
    publicUrlIsHttps: instagramRedirectUri().startsWith("https://")
  };
};

export const getApp = async (_req: Request, res: Response): Promise<Response> => res.json(await appView());

export const putApp = async (req: Request, res: Response): Promise<Response> => {
  const { appId, appSecret } = req.body || {};
  if (appId !== undefined && !/^\d{6,25}$/.test(String(appId).trim())) throw new AppError("ERR_META_APP_ID", 400);
  await saveMetaApp({
    appId: appId === undefined ? undefined : String(appId),
    appSecret: typeof appSecret === "string" && !isMasked(appSecret) ? appSecret : undefined
  });
  return res.json(await appView());
};

// what any signed-in person needs to know to show the "Conectar meu Instagram" button
export const status = async (req: Request, res: Response): Promise<Response> => {
  const app = await getMetaApp();
  return res.json({ configured: isMetaAppReady(app), canConfigure: isManagerReq(req) });
};

// ------------------------------------------------------------------ Instagram login
export const authorize = async (req: Request, res: Response): Promise<Response> => {
  const app = await getMetaApp();
  if (!isMetaAppReady(app)) throw new AppError("ERR_META_APP_NOT_CONFIGURED", 400);
  const me = Number(req.user.id);
  const whatsappId = req.query.whatsappId ? Number(req.query.whatsappId) : null;

  if (whatsappId) {
    const w = await Whatsapp.findByPk(whatsappId, { attributes: ["id", "ownerId", "channel"] });
    if (!w || w.channel !== "instagram") throw new AppError("ERR_NO_WAPP_FOUND", 404);
    if (!isManagerReq(req) && w.ownerId !== me) throw new AppError("ERR_NO_PERMISSION", 403);
  } else if (!isManagerReq(req)) {
    const limit = Number(await getSetting("max_connections_per_user", "1")) || 1;
    if ((await Whatsapp.count({ where: { ownerId: me, channel: "instagram" } as any })) >= limit) throw new AppError("ERR_CONNECTION_LIMIT", 400);
  }

  const params = new URLSearchParams({
    client_id: app.appId,
    redirect_uri: instagramRedirectUri(),
    response_type: "code",
    scope: IG_SCOPES.join(","),
    state: signState(me, whatsappId),
    force_reauth: "true"
  });
  return res.json({ url: `${IG_AUTH_URL}?${params.toString()}` });
};

// Instagram sends the person back here (a page, not the API): the connection is saved and they are sent to the connections screen.
export const callback = async (req: Request, res: Response): Promise<void> => {
  const back = (ok: boolean, message = "") =>
    res.redirect(`${frontBase()}/connections?instagram=${ok ? "ok" : "erro"}${message ? `&motivo=${encodeURIComponent(message.slice(0, 200))}` : ""}`);

  const state = readState(String(req.query.state || ""));
  if (req.query.error || req.query.error_reason) return back(false, String(req.query.error_description || "O acesso foi negado no Instagram."));
  if (!state || !req.query.code) return back(false, "Link de conexão expirado. Tente conectar de novo.");

  try {
    const app = await getMetaApp();
    if (!isMetaAppReady(app)) return back(false, "O app da Meta não está configurado.");
    const code = String(req.query.code).replace(/#_$/, "");

    // 1. short-lived token (1 h)
    const form = new URLSearchParams({
      client_id: app.appId,
      client_secret: app.appSecret,
      grant_type: "authorization_code",
      redirect_uri: instagramRedirectUri(),
      code
    });
    const short = (await axios.post(IG_TOKEN_URL, form.toString(), { headers: { "Content-Type": "application/x-www-form-urlencoded" }, timeout: 20000 })).data;
    const shortToken: string = short.access_token || short.data?.[0]?.access_token;
    if (!shortToken) throw new Error("O Instagram não devolveu o acesso.");

    // 2. long-lived token (60 days, renewed by the worker)
    const long = (await axios.get(`${IG_GRAPH}/access_token`, {
      params: { grant_type: "ig_exchange_token", client_secret: app.appSecret, access_token: shortToken },
      timeout: 20000
    })).data;
    const token: string = long.access_token || shortToken;
    const expiresAt = new Date(Date.now() + Number(long.expires_in || 5184000) * 1000).toISOString();

    // 3. who connected (user_id is the id that comes in the webhook `entry.id`)
    const profile = (await axios.get(`${IG_GRAPH}/me`, { params: { fields: "user_id,username,name,account_type", access_token: token }, timeout: 20000 })).data;
    const igUserId = String(profile.user_id || profile.id);
    const username = String(profile.username || igUserId);
    if (profile.account_type && !["BUSINESS", "MEDIA_CREATOR", "CREATOR"].includes(String(profile.account_type).toUpperCase())) {
      return back(false, "Esta conta do Instagram é pessoal. Mude para conta Profissional (Comercial ou Criador) nas configurações do Instagram e tente de novo.");
    }

    // 4. messages and reactions of this account come to the app webhook
    let subscribed = true;
    try {
      await axios.post(`${IG_GRAPH}/${igUserId}/subscribed_apps`, null, {
        params: { subscribed_fields: "messages,messaging_postbacks,message_reactions,messaging_seen", access_token: token },
        timeout: 20000
      });
    } catch (err) {
      subscribed = false;
      logger.warn(`Instagram subscribed_apps failed for ${username}: ${providerReason(err)}`);
    }

    const config = sealConfig(JSON.stringify({ mode: "oauth", accessToken: token, igUserId, username, tokenExpiresAt: expiresAt, subscribed, connectedAt: new Date().toISOString() })) as string;

    // reconnecting the same connection (or the same account, already connected once) updates it; otherwise a new one is created
    let whatsapp: Whatsapp | null = state.whatsappId ? await Whatsapp.findByPk(state.whatsappId) : null;
    if (!whatsapp) {
      const same = await Whatsapp.findAll({ where: { channel: "instagram" } as any });
      whatsapp = same.find(w => getConfig(w).igUserId === igUserId) || null;
    }
    if (whatsapp) {
      await whatsapp.update({ config, session: `@${username}` });
    } else {
      const owner = await User.findByPk(state.userId);
      const ownerIsManager = !!owner && isManagerRole(roleOf(owner as any));
      let name = `Instagram @${username}`;
      for (let n = 2; await Whatsapp.findOne({ where: { name } }); n += 1) name = `Instagram @${username} ${n}`;
      const created = await CreateWhatsAppService({
        name,
        status: "CONNECTED",
        channel: "instagram",
        config,
        ownerId: ownerIsManager ? null : state.userId
      });
      whatsapp = created.whatsapp;
      await whatsapp.update({ session: `@${username}` });
    }
    await setChannelStatus(whatsapp, "CONNECTED");
    getIO().emit("whatsapp", { action: "update", whatsapp });
    return back(true);
  } catch (err) {
    logger.error(`Instagram login failed: ${providerReason(err)}`);
    return back(false, providerReason(err));
  }
};
