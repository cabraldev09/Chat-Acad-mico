const MASK = "••••";

export const isMasked = (value: unknown): boolean =>
  typeof value === "string" && value.startsWith(MASK);

export const maskSecret = (value?: string | null): string | null | undefined => {
  if (!value) return value;
  return `${MASK}${value.slice(-4)}`;
};

export const SECRET_CONFIG_KEYS = [
  "accessToken",
  "appSecret",
  "botToken",
  "verifyToken",
  "refreshToken"
];

// Config JSON of a channel connection, with credentials masked for display (the sealed value is opened first, so the last 4 characters shown are the real ones)
export const maskConfig = (config?: string | null): string | null | undefined => {
  if (!config) return config;
  try {
    const parsed = JSON.parse(config);
    SECRET_CONFIG_KEYS.forEach(key => {
      if (parsed[key]) parsed[key] = maskSecret(openSecret(String(parsed[key])));
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
  return sealConfig(JSON.stringify(next)) as string;
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

// The credentials of a channel connection are stored sealed (AES-256-GCM): a copy of the database alone does not reveal them. Values written
// before sealing existed are read as they are and sealed the next time the connection is saved.
export const sealConfig = (config?: string | null): string | undefined => {
  if (!config) return config === null ? undefined : config;
  try {
    const parsed = JSON.parse(config);
    SECRET_CONFIG_KEYS.forEach(key => {
      const value = parsed[key];
      if (typeof value === "string" && value && !isMasked(value) && !value.startsWith(SEAL_PREFIX)) parsed[key] = sealSecret(value);
    });
    return JSON.stringify(parsed);
  } catch (e) {
    return config;
  }
};

// the same config with every credential opened (what the channel code uses to talk to the provider)
export const openConfig = (config: Record<string, any>): Record<string, any> => {
  const out = { ...config };
  SECRET_CONFIG_KEYS.forEach(key => {
    if (typeof out[key] === "string" && out[key]) out[key] = openSecret(out[key]);
  });
  return out;
};
