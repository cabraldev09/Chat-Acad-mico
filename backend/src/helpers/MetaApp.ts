import crypto from "crypto";

import authConfig from "../config/auth";
import { getSetting, setSetting } from "./AppSettings";
import { getSecretSetting, setSecretSetting } from "./SecretSettings";
import { getPublicUrl } from "./PublicUrl";

// The Meta (Facebook for Developers) app the Instagram login goes through. It is registered once per installation:
// whoever installs the system creates the app on developers.facebook.com and types its id and secret here.
export const IG_AUTH_URL = process.env.INSTAGRAM_AUTH_URL || "https://www.instagram.com/oauth/authorize";
export const IG_TOKEN_URL = process.env.INSTAGRAM_TOKEN_URL || "https://api.instagram.com/oauth/access_token";
export const IG_GRAPH = process.env.INSTAGRAM_GRAPH_URL || "https://graph.instagram.com";
export const IG_SCOPES = ["instagram_business_basic", "instagram_business_manage_messages"];

export interface MetaApp {
  appId: string;
  appSecret: string;
  verifyToken: string;
}

export const getMetaApp = async (): Promise<MetaApp> => ({
  appId: (await getSetting("meta_app_id", "")).trim(),
  appSecret: (await getSecretSetting("meta_app_secret", "")).trim(),
  verifyToken: await getSecretSetting("meta_verify_token", "")
});

export const isMetaAppReady = (app: MetaApp): boolean => !!(app.appId && app.appSecret);

export const saveMetaApp = async (input: { appId?: string; appSecret?: string }): Promise<void> => {
  if (typeof input.appId === "string") await setSetting("meta_app_id", input.appId.trim());
  if (typeof input.appSecret === "string" && input.appSecret.trim()) await setSecretSetting("meta_app_secret", input.appSecret.trim());
  // the verify token is only a password between Meta and this server: it is generated, nobody has to invent one
  if (!(await getSecretSetting("meta_verify_token", ""))) await setSecretSetting("meta_verify_token", crypto.randomBytes(18).toString("hex"));
};

export const instagramRedirectUri = (): string => `${getPublicUrl()}/oauth/instagram/callback`;
export const appWebhookUrl = (): string => `${getPublicUrl()}/webhooks/meta`;

// ------------------------------------------------------------------ signed state
// What goes to Instagram and comes back: who is connecting, which connection (if it is being reconnected) and until when.
// Signed so nobody can complete a login on behalf of another person.
const stateKey = (): Buffer => crypto.createHash("sha256").update(`oauth-state:${authConfig.secret}`).digest();

export interface OAuthState {
  userId: number;
  whatsappId: number | null;
  exp: number;
}

export const signState = (userId: number, whatsappId: number | null, ttlMs = 15 * 60000): string => {
  const payload = Buffer.from(JSON.stringify({ userId, whatsappId, exp: Date.now() + ttlMs } as OAuthState)).toString("base64url");
  const sig = crypto.createHmac("sha256", stateKey()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
};

export const readState = (state: string): OAuthState | null => {
  const [payload, sig] = String(state || "").split(".");
  if (!payload || !sig) return null;
  const expected = crypto.createHmac("sha256", stateKey()).update(payload).digest("base64url");
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as OAuthState;
    return parsed.exp > Date.now() ? parsed : null;
  } catch (e) {
    return null;
  }
};
