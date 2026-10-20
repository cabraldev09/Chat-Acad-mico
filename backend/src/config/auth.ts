import { randomBytes } from "crypto";

// The signing secrets of the sessions. In production they must be set and must not be one of the well-known example values; elsewhere a
// random secret is made for this process (sessions end when it restarts) instead of a fixed one anyone could know.
const KNOWN_EXAMPLES = new Set(["mysecret", "myanothersecret", "troque", "changeme", "secret"]);
const production = process.env.NODE_ENV === "production";

const pick = (name: "JWT_SECRET" | "JWT_REFRESH_SECRET"): string => {
  const value = (process.env[name] || "").trim();
  if (production) {
    if (!value) throw new Error("JWT_SECRET and JWT_REFRESH_SECRET must be set in production");
    if (KNOWN_EXAMPLES.has(value.toLowerCase())) throw new Error(`${name} has a well-known example value: generate a long random one (openssl rand -hex 32)`);
    return value;
  }
  return value || randomBytes(32).toString("hex");
};

export default {
  secret: pick("JWT_SECRET"),
  expiresIn: "15m" as const,
  refreshSecret: pick("JWT_REFRESH_SECRET"),
  refreshExpiresIn: "7d" as const
};
