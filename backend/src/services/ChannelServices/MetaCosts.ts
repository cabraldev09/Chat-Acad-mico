import axios from "axios";

import Whatsapp from "../../models/Whatsapp";
import { GRAPH } from "../../channels/meta";
import { getConfig } from "../../channels/types";
import { wabaOf } from "../CampaignServices/Templates";
import { logger } from "../../utils/logger";

// What the official WhatsApp API cost, read on the Meta itself (the WABA's pricing analytics): the total of the period, each day,
// each pricing category and each number. Each WhatsApp account (WABA) is read once even when several numbers share it. The
// Meta updates these numbers a few times an hour; a short cache spares the API when the screen refreshes.

export interface CostPoint { start: number; cost: number; volume: number; category: string; type: string; phone: string }
export interface MetaCostReport {
  from: string; to: string; currency: string | null; updatedAt: string;
  total: number; volume: number; freeVolume: number; today: number;
  byDay: Array<{ date: string; cost: number; volume: number }>;
  byCategory: Array<{ category: string; label: string; cost: number; volume: number }>;
  byNumber: Array<{ phone: string; name: string; cost: number; volume: number }>;
  accounts: Array<{ wabaId: string; name: string | null; connections: string[]; ok: boolean; error: string | null }>;
}

export const CATEGORY_LABEL: Record<string, string> = {
  MARKETING: "Marketing", MARKETING_LITE: "Marketing (leve)", UTILITY: "Utilidade", AUTHENTICATION: "Autenticação",
  AUTHENTICATION_INTERNATIONAL: "Autenticação internacional", SERVICE: "Atendimento", REFERRAL_CONVERSION: "Anúncio (clique para WhatsApp)"
};

const num = (v: any): number => (Number.isFinite(Number(v)) ? Number(v) : 0);
const digits = (s: any): string => String(s || "").replace(/\D/g, "");
const dayOf = (unix: number, tz: string): string => new Date(unix * 1000).toLocaleDateString("en-CA", { timeZone: tz });

// the points of pricing_analytics (per message, the current Meta pricing) or, on accounts still on the old model, of conversation_analytics
export const parsePoints = (data: any): CostPoint[] => {
  const blocks = data?.pricing_analytics?.data || data?.conversation_analytics?.data || [];
  return blocks.flatMap((b: any) => (b.data_points || []).map((p: any) => ({
    start: num(p.start), cost: num(p.cost), volume: num(p.volume ?? p.conversation),
    category: String(p.pricing_category || p.conversation_category || "OUTROS").toUpperCase(),
    type: String(p.pricing_type || p.conversation_type || "REGULAR").toUpperCase(),
    phone: digits(p.phone_number)
  })));
};

const graphError = (err: any): string => {
  const e = err?.response?.data?.error;
  if (e?.code === 190) return "O token da conexão expirou ou é inválido: troque em Conexões.";
  if (e?.code === 10 || e?.code === 200 || e?.code === 100) return "O token não tem acesso aos custos desta conta (permissão whatsapp_business_management).";
  return e?.message || err?.message || "Falha ao consultar a Meta.";
};

const readWaba = async (waba: string, token: string, from: number, to: number): Promise<{ name: string | null; currency: string | null; points: CostPoint[] }> => {
  const { data: info } = await axios.get(`${GRAPH}/${waba}`, { params: { fields: "name,currency", access_token: token }, timeout: 15000 });
  const pricing = `pricing_analytics.start(${from}).end(${to}).granularity(DAILY).dimensions(["PRICING_CATEGORY","PRICING_TYPE","PHONE"])`;
  try {
    const { data } = await axios.get(`${GRAPH}/${waba}`, { params: { fields: pricing, access_token: token }, timeout: 20000 });
    return { name: info?.name || null, currency: info?.currency || null, points: parsePoints(data) };
  } catch (err) {
    // accounts still billed by conversation answer only to the older metric
    const legacy = `conversation_analytics.start(${from}).end(${to}).granularity(DAILY).metric_types(["COST","CONVERSATION"]).dimensions(["CONVERSATION_CATEGORY","CONVERSATION_TYPE","PHONE"])`;
    const { data } = await axios.get(`${GRAPH}/${waba}`, { params: { fields: legacy, access_token: token }, timeout: 20000 });
    return { name: info?.name || null, currency: info?.currency || null, points: parsePoints(data) };
  }
};

export const summarizeCosts = (points: CostPoint[], tz: string, phoneNames: Map<string, string>, todayKey: string) => {
  const byDay = new Map<string, { cost: number; volume: number }>();
  const byCat = new Map<string, { cost: number; volume: number }>();
  const byNum = new Map<string, { cost: number; volume: number }>();
  let total = 0; let volume = 0; let freeVolume = 0; let today = 0;
  points.forEach(p => {
    const d = dayOf(p.start, tz);
    total += p.cost; volume += p.volume;
    if (p.type.startsWith("FREE")) freeVolume += p.volume;
    if (d === todayKey) today += p.cost;
    const add = (m: Map<string, { cost: number; volume: number }>, k: string) => { const cur = m.get(k) || { cost: 0, volume: 0 }; cur.cost += p.cost; cur.volume += p.volume; m.set(k, cur); };
    add(byDay, d); add(byCat, p.category); add(byNum, p.phone || "-");
  });
  const round = (v: number) => Math.round(v * 100) / 100;
  return {
    total: round(total), volume, freeVolume, today: round(today),
    byDay: [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, v]) => ({ date, cost: round(v.cost), volume: v.volume })),
    byCategory: [...byCat.entries()].map(([category, v]) => ({ category, label: CATEGORY_LABEL[category] || category, cost: round(v.cost), volume: v.volume })).sort((a, b) => b.cost - a.cost || b.volume - a.volume),
    byNumber: [...byNum.entries()].map(([phone, v]) => ({ phone, name: phoneNames.get(phone) || phone, cost: round(v.cost), volume: v.volume })).sort((a, b) => b.cost - a.cost)
  };
};

const cache = new Map<string, { at: number; report: MetaCostReport }>();
const TTL = 2 * 60 * 1000;

export const metaCosts = async (fromDay: string, toDay: string, tz: string, fresh = false): Promise<MetaCostReport> => {
  const key = `${fromDay}|${toDay}|${tz}`;
  const hit = cache.get(key);
  if (!fresh && hit && Date.now() - hit.at < TTL) return hit.report;

  const from = Math.floor(new Date(`${fromDay}T00:00:00Z`).getTime() / 1000) - 12 * 3600; // the Meta works in UTC: take the edges and filter by local day
  const to = Math.min(Math.floor(Date.now() / 1000), Math.floor(new Date(`${toDay}T23:59:59Z`).getTime() / 1000) + 12 * 3600);
  const connections = await Whatsapp.findAll({ where: { channel: "whatsapp_cloud" } });
  const byWaba = new Map<string, { token: string; names: string[] }>();
  const phoneNames = new Map<string, string>();
  const accounts: MetaCostReport["accounts"] = [];
  for (const w of connections) {
    const { accessToken, wabaId } = getConfig(w) as any;
    if (w.session) phoneNames.set(digits(w.session), w.name); // the number as the Meta shows it (kept by CloudHealth)
    if (!accessToken) { accounts.push({ wabaId: "-", name: null, connections: [w.name], ok: false, error: "Conexão sem token." }); continue; }
    let wabas: string[] = [];
    // eslint-disable-next-line no-await-in-loop
    try { wabas = await wabaOf(accessToken, wabaId); } catch (err) { accounts.push({ wabaId: "-", name: null, connections: [w.name], ok: false, error: graphError(err) }); continue; }
    if (!wabas.length) accounts.push({ wabaId: "-", name: null, connections: [w.name], ok: false, error: "Não foi possível descobrir a conta do WhatsApp (WABA) do token." });
    wabas.forEach(id => { const cur = byWaba.get(id) || { token: accessToken as string, names: [] as string[] }; cur.names.push(w.name); byWaba.set(id, cur); });
  }

  let currency: string | null = null;
  const points: CostPoint[] = [];
  for (const [waba, { token, names }] of byWaba) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const r = await readWaba(waba, token, from, to);
      currency = currency || r.currency;
      points.push(...r.points);
      accounts.push({ wabaId: waba, name: r.name, connections: names, ok: true, error: null });
    } catch (err) {
      logger.warn(`Custos da Meta (WABA ${waba}): ${graphError(err)}`);
      accounts.push({ wabaId: waba, name: null, connections: names, ok: false, error: graphError(err) });
    }
  }
  const inRange = points.filter(p => { const d = dayOf(p.start, tz); return d >= fromDay && d <= toDay; });
  const todayKey = new Date().toLocaleDateString("en-CA", { timeZone: tz });
  const report: MetaCostReport = { from: fromDay, to: toDay, currency, updatedAt: new Date().toISOString(), accounts, ...summarizeCosts(inRange, tz, phoneNames, todayKey) };
  cache.set(key, { at: Date.now(), report });
  return report;
};
