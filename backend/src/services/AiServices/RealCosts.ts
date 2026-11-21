import axios from "axios";
import { QueryTypes } from "sequelize";

import sequelize from "../../database";
import { getSetting } from "../../helpers/AppSettings";
import { getSecretSetting } from "../../helpers/SecretSettings";
import { getAppTz } from "../../helpers/AppTime";
import { logger } from "../../utils/logger";

// What the OpenAI really charged, read from its costs API (/v1/organization/costs). It needs an administrator key of the organization
// ("Admin key", different from the key the agents use), saved sealed in the keys form; without it, only the system's estimate exists.
// The OpenAI has no API for the remaining credit: the manager types the budget of the month and the screen shows what is left.
const OPENAI_URL = () => process.env.OPENAI_API_URL || "https://api.openai.com";
const CACHE_MS = 10 * 60000;
let cache: { key: string; at: number; value: RealCosts } | null = null;

export interface RealCosts { ok: boolean; usd: number; byDay: { day: string; usd: number }[]; error?: string }

export const openaiRealCosts = async (since: Date, until = new Date()): Promise<RealCosts | null> => {
  const key = await getSecretSetting("ai_openai_admin_key");
  if (!key) return null;
  const start = Math.floor(since.getTime() / 1000);
  const end = Math.ceil(until.getTime() / 1000);
  const cacheKey = `${start}:${Math.floor(end / 600)}`;
  if (cache && cache.key === cacheKey && Date.now() - cache.at < CACHE_MS) return cache.value;
  const byDay = new Map<string, number>();
  try {
    let page: string | undefined;
    for (let i = 0; i < 6; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const { data } = await axios.get(`${OPENAI_URL()}/v1/organization/costs`, {
        params: { start_time: start, end_time: end, bucket_width: "1d", limit: 31, ...(page ? { page } : {}) },
        headers: { Authorization: `Bearer ${key}` },
        timeout: 15000
      });
      (data?.data || []).forEach((bucket: any) => {
        const day = new Date(Number(bucket.start_time) * 1000).toLocaleDateString("en-CA", { timeZone: getAppTz() });
        const usd = (bucket.results || []).reduce((sum: number, r: any) => sum + (Number(r?.amount?.value) || 0), 0);
        byDay.set(day, (byDay.get(day) || 0) + usd);
      });
      if (!data?.has_more || !data?.next_page) break;
      page = String(data.next_page);
    }
    const days = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, usd]) => ({ day, usd: Math.round(usd * 10000) / 10000 }));
    const value: RealCosts = { ok: true, usd: Math.round(days.reduce((a, d) => a + d.usd, 0) * 10000) / 10000, byDay: days };
    cache = { key: cacheKey, at: Date.now(), value };
    return value;
  } catch (err: any) {
    const status = err?.response?.status;
    logger.warn(`OpenAI costs not read: ${status || ""} ${err?.response?.data?.error?.message || err?.message || err}`);
    return {
      ok: false,
      usd: 0,
      byDay: [],
      error: status === 401 || status === 403
        ? "A OpenAI recusou a chave de administrador. Confira em Agentes de IA, Chaves, se é uma chave de administrador da organização."
        : "Não foi possível ler os custos na OpenAI agora."
    };
  }
};

// the first moment of the month in the time zone of the company
export const monthStart = (now = new Date()): Date => {
  const tz = getAppTz();
  const local = now.toLocaleDateString("en-CA", { timeZone: tz });
  const first = `${local.slice(0, 8)}01T00:00:00`;
  // the offset of the zone on that day (Brazil has no daylight saving time today, but the zone is configurable)
  const asUtc = new Date(`${first}Z`);
  const shown = new Date(asUtc.toLocaleString("en-US", { timeZone: tz }));
  return new Date(asUtc.getTime() + (asUtc.getTime() - shown.getTime()));
};

export const estimatedSince = async (since: Date, provider?: "openai" | "anthropic"): Promise<number> => {
  const filter = provider === "openai" ? `AND COALESCE(model, '') !~* '(claude|anthropic)'` : provider === "anthropic" ? `AND COALESCE(model, '') ~* '(claude|anthropic)'` : "";
  const rows: any[] = await sequelize.query(`SELECT COALESCE(SUM("estimatedUsd"), 0)::float AS usd FROM "AiUsage" WHERE "createdAt" >= :since ${filter}`, { replacements: { since }, type: QueryTypes.SELECT });
  return Number(rows[0]?.usd || 0);
};

export interface Budget { limit: number; spent: number; remaining: number; pct: number; source: "real" | "estimado"; warn: boolean }

// the budget of the month typed by the manager and what was spent: the OpenAI's real bill when the admin key exists (+ the Anthropic estimate),
// otherwise the system's estimate; warns from 80%
export const monthBudget = async (): Promise<Budget | null> => {
  const limit = Number(String(await getSetting("ai_monthly_budget_usd", "0")).replace(",", ".")) || 0;
  if (limit <= 0) return null;
  const since = monthStart();
  const real = await openaiRealCosts(since).catch(() => null);
  const spent = real && real.ok ? real.usd + (await estimatedSince(since, "anthropic")) : await estimatedSince(since);
  const pct = Math.round((spent / limit) * 1000) / 10;
  return { limit, spent: Math.round(spent * 100) / 100, remaining: Math.round(Math.max(0, limit - spent) * 100) / 100, pct, source: real && real.ok ? "real" : "estimado", warn: pct >= 80 };
};
