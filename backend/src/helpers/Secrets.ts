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
