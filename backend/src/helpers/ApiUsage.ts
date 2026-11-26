import { Request } from "express";

// WHAT EACH API TOKEN IS USED FOR: before an old token (full access) is replaced or the token of Configurações is turned off, the
// administration sees which routes each one calls ("GET /api/v1/leads", 120 times, last on 25/11) and so which integration depends on it.
// Only the method and the route, with the numbers taken out (never a query, a body, an IP or a person). Kept in memory and written at most
// once a minute per token, together with its last use.
export interface UsageSummary {
  since: string;
  routes: Record<string, { count: number; last: string }>;
}

const MAX_ROUTES = 30;
const pending = new Map<string, Map<string, number>>();

export const routeKey = (req: Pick<Request, "method" | "baseUrl" | "path">): string =>
  `${String(req.method || "GET").toUpperCase()} ${`${req.baseUrl || ""}${req.path || ""}`.replace(/\/\d+(?=\/|$)/g, "/:id").replace(/[^\w/:.-]/g, "").slice(0, 80)}`;

export const recordUse = (tokenKey: string, req: Pick<Request, "method" | "baseUrl" | "path">): void => {
  const routes = pending.get(tokenKey) || new Map<string, number>();
  const key = routeKey(req);
  routes.set(key, (routes.get(key) || 0) + 1);
  pending.set(tokenKey, routes);
};

export const parseUsage = (raw: any): UsageSummary | null => {
  if (!raw) return null;
  try {
    const v = typeof raw === "string" ? JSON.parse(raw) : raw;
    return v && typeof v === "object" && v.routes ? (v as UsageSummary) : null;
  } catch (e) {
    return null;
  }
};

// the stored summary plus what is pending for this token (and the pending part is cleared)
export const mergeUsage = (tokenKey: string, stored: any, now = new Date()): UsageSummary => {
  const base: UsageSummary = parseUsage(stored) || { since: now.toISOString(), routes: {} };
  const routes = { ...base.routes };
  (pending.get(tokenKey) || new Map()).forEach((count, key) => {
    routes[key] = { count: (routes[key]?.count || 0) + count, last: now.toISOString() };
  });
  pending.delete(tokenKey);
  // the routes most used stay when there are too many
  const kept = Object.entries(routes).sort((a, b) => b[1].count - a[1].count).slice(0, MAX_ROUTES);
  return { since: base.since, routes: Object.fromEntries(kept) };
};
