// Base URL that external services (Meta, browsers embedding the web
// chat) use to reach this backend. Set PUBLIC_URL when exposing it through a
// tunnel such as cloudflared/ngrok.
export const getPublicUrl = (): string => {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/$/, "");
  const base = process.env.BACKEND_URL || "http://localhost";
  const port = process.env.PROXY_PORT;
  return port ? `${base}:${port}` : base;
};
