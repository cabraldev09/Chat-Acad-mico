const MASK = "••••";

export const isMasked = (value: unknown): boolean =>
  typeof value === "string" && value.startsWith(MASK);

export const maskSecret = (value?: string | null): string | null | undefined => {
  if (!value) return value;
  return `${MASK}${value.slice(-4)}`;
};

const SECRET_CONFIG_KEYS = [
  "accessToken",
  "appSecret",
  "botToken",
  "verifyToken"
];

// Config JSON of a channel connection, with credentials masked for display
export const maskConfig = (config?: string | null): string | null | undefined => {
  if (!config) return config;
  try {
    const parsed = JSON.parse(config);
    SECRET_CONFIG_KEYS.forEach(key => {
      if (parsed[key]) parsed[key] = maskSecret(parsed[key]);
    });
    return JSON.stringify(parsed);
  } catch (e) {
    return config;
  }
};

// Merge an edited config over the stored one, keeping stored secrets when the
// client sent the masked placeholder back unchanged.
export const mergeConfig = (oldConfig: string | null | undefined, newConfig: string): string => {
  let previous: Record<string, any> = {};
  try {
    previous = oldConfig ? JSON.parse(oldConfig) : {};
  } catch (e) {
    previous = {};
  }
  const next = JSON.parse(newConfig);
  Object.keys(next).forEach(key => {
    if (isMasked(next[key]) && previous[key]) next[key] = previous[key];
  });
  // fields the client does not manage (e.g. generated webchat token)
  Object.keys(previous).forEach(key => {
    if (next[key] === undefined) next[key] = previous[key];
  });
  return JSON.stringify(next);
};

// ------------------------------------------------------------------ secrets kept in the database
// A password the system must read back later (the e-mail account) is stored sealed with AES-256-GCM, keyed from the
// server secret, so a copy of the database alone does not reveal it. Values written before sealing existed (plain)
// are read as they are.
import crypto from "crypto";
import authConfig from "../config/auth";

const SEAL_PREFIX = "enc:v1:";
const sealKey = (): Buffer => crypto.createHash("sha256").update(`seal:${authConfig.secret}`).digest();

export const sealSecret = (plain: string): string => {
  if (!plain) return "";
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", sealKey(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `${SEAL_PREFIX}${iv.toString("base64")}:${cipher.getAuthTag().toString("base64")}:${data.toString("base64")}`;
};

export const openSecret = (stored: string): string => {
  if (!stored || !stored.startsWith(SEAL_PREFIX)) return stored || "";
  try {
    const [iv, tag, data] = stored.slice(SEAL_PREFIX.length).split(":").map(p => Buffer.from(p, "base64"));
    const decipher = crypto.createDecipheriv("aes-256-gcm", sealKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  } catch (e) {
    // sealed with another server secret: unreadable, the administrator types it again
    return "";
  }
};
