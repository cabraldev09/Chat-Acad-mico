// FRONTEND_URL may hold one address or several separated by commas (for example the Vercel address
// and the company domain). A trailing slash is ignored: browsers send the origin without it.
export const allowedOrigins = (): string[] =>
  String(process.env.FRONTEND_URL || "")
    .split(",")
    .map(o => o.trim().replace(/\/+$/, ""))
    .filter(Boolean);

// value for the `origin` option of cors / socket.io
export const corsOrigin = (): any => {
  const list = allowedOrigins();
  if (!list.length) return false;
  return list.length === 1 ? list[0] : list;
};
