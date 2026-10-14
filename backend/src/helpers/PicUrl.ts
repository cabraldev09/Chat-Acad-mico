// Pictures saved on our side are stored as a relative path; this turns it into the address the browser opens.
export const publicPicUrl = (raw?: string | null): string | null => {
  if (!raw) return null;
  if (/^https?:\/\//.test(raw)) return raw;
  const base = process.env.BACKEND_URL || "";
  const port = process.env.PROXY_PORT;
  const origin = /^https:\/\//.test(base) || !port ? base : `${base}:${port}`;
  return `${origin}/public/${raw}`;
};

export const isLocalPic = (raw?: string | null): boolean => !!raw && !/^https?:\/\//.test(raw);
