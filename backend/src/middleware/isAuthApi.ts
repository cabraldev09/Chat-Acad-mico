import { Request, Response, NextFunction } from "express";

import AppError from "../errors/AppError";
import { getSetting, setSetting } from "../helpers/AppSettings";
import { ApiCaller, FULL_ACCESS, hashToken, polosOf, sameSecret, scopesOf } from "../helpers/ApiTokens";
import ApiToken from "../models/ApiToken";
import Setting from "../models/Setting";

// the old single token of Configurações (Settings.userApiToken): on by default (an unknown integration may use it), the administrator
// turns it off in Configurações → Integração. It has full access and no polo limit.
export const LEGACY_TOKEN_SETTING = "api_legacy_token_enabled";
export const legacyTokenEnabled = async (): Promise<boolean> => (await getSetting(LEGACY_TOKEN_SETTING, "true")) !== "false";

// the last use is written at most once a minute per token (a busy integration does not write on every call)
const USE_EVERY_MS = 60000;

const isAuthApi = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
  // "Authorization: Bearer <token>" (the word before the token is not checked, as before)
  const [, token] = String(req.headers.authorization || "").split(" ");
  if (!token) throw new AppError("ERR_SESSION_EXPIRED", 401);

  const stored = await ApiToken.findOne({ where: { tokenHash: hashToken(token) } });
  if (stored) {
    if (stored.expiresAt && new Date(stored.expiresAt).getTime() <= Date.now()) throw new AppError("ERR_API_TOKEN_EXPIRED", 401);
    (req as any).apiToken = { id: stored.id, scopes: scopesOf(stored.scopes), poloIds: polosOf(stored.poloIds), legacy: !!stored.legacy } as ApiCaller;
    if (!stored.lastUsedAt || Date.now() - new Date(stored.lastUsedAt).getTime() > USE_EVERY_MS) stored.update({ lastUsedAt: new Date() }).catch(() => undefined);
    return next();
  }

  if (await legacyTokenEnabled()) {
    const legacy = await Setting.findOne({ where: { key: "userApiToken" }, attributes: ["value"] });
    if (legacy?.value && sameSecret(token, legacy.value)) {
      (req as any).apiToken = { id: null, scopes: [FULL_ACCESS], poloIds: null, legacy: true } as ApiCaller;
      const last = Number(new Date(await getSetting("api_legacy_token_used_at", "")).getTime()) || 0;
      if (Date.now() - last > USE_EVERY_MS) setSetting("api_legacy_token_used_at", new Date().toISOString()).catch(() => undefined);
      return next();
    }
  }
  throw new AppError("ERR_SESSION_EXPIRED", 401);
};

export default isAuthApi;
