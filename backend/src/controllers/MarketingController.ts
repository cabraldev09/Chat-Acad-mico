import { Request, Response } from "express";
import { QueryTypes } from "sequelize";

import sequelize from "../database";
import AppError from "../errors/AppError";
import { dayBounds, getAppTz, shiftDays } from "../helpers/AppTime";
import MarketingSpend from "../models/MarketingSpend";
import { CRM_OPTIONS } from "../services/CrmServices/crmOptions";

const uid = (req: Request): number => Number(req.user.id);
const clip = (v: any, n: number): string => String(v || "").trim().slice(0, n);
const money = (v: any): number => Math.round(Number(String(v).replace(",", ".")) * 100) / 100;
const present = (m: MarketingSpend) => ({ id: m.id, month: m.month, source: m.source, campaign: m.campaign, amount: Number(m.amount), note: m.note });
const ymd = (d: Date): string => d.toLocaleDateString("en-CA", { timeZone: "America/Porto_Velho" });

// the period of a report: "YYYY-MM-DD" to "YYYY-MM-DD" in the timezone of the company (default: the last 90 days)
const periodOf = (q: any) => {
  const today = dayBounds().start;
  const from = /^\d{4}-\d{2}-\d{2}$/.test(String(q.from || "")) ? String(q.from) : ymd(shiftDays(today, -89));
  const to = /^\d{4}-\d{2}-\d{2}$/.test(String(q.to || "")) ? String(q.to) : ymd(today);
  return { from, to, start: dayBounds(from).start, end: dayBounds(to).end };
};

// Where the money goes. Leads that arrive by WhatsApp do not say which ad brought them, so the spending is recorded by
// advertising channel and compared with the total result; only the channels that leave a trace in the lead's origin (the
// "sources" below) can also be followed lead by lead.
export const MARKETING_CHANNELS: Array<{ name: string; sources: string[]; hint: string }> = [
  { name: "Meta Ads (Instagram e Facebook)", sources: ["Instagram", "Facebook"], hint: "Anúncios no Instagram e no Facebook" },
  { name: "Google Ads", sources: ["Google"], hint: "Anúncios de busca e de rede do Google" },
  { name: "TikTok Ads", sources: [], hint: "Anúncios no TikTok" },
  { name: "Eventos e feiras", sources: ["Evento / feira"], hint: "Estande, patrocínio, visitas a escolas" },
  { name: "Panfletos e outdoor", sources: [], hint: "Material impresso, faixas, outdoor" },
  { name: "Rádio e TV", sources: [], hint: "Veiculação em rádio, TV e carro de som" },
  { name: "Influenciadores e parcerias", sources: [], hint: "Divulgação paga por parceiros" },
  { name: "Brindes e materiais", sources: [], hint: "Camisetas, canetas, kits" },
  { name: "Outros", sources: [], hint: "O que não cabe nos demais" }
];
// a channel named like a lead source (how older entries were recorded) follows that source
const sourcesOfChannel = (channel: string): string[] => {
  const known = MARKETING_CHANNELS.find(c => c.name === channel);
  if (known) return known.sources;
  return CRM_OPTIONS.sources.includes(channel) && channel !== "WhatsApp" && channel !== "Outro" ? [channel] : [];
};

// ------------------------------------------------------------------ spending
export const listSpend = async (req: Request, res: Response): Promise<Response> => {
  const { from, to } = periodOf(req.query);
  const rows = await MarketingSpend.findAll({ order: [["month", "DESC"], ["id", "DESC"]], limit: 500 });
  return res.json(rows.filter(r => r.month >= from.slice(0, 7) && r.month <= to.slice(0, 7)).map(present));
};

const fields = (b: any) => {
  const month = String(b.month || "");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new AppError("ERR_INVALID_PARAMETER", 400);
  const source = clip(b.source, 80);
  if (!source) throw new AppError("ERR_FIELD_REQUIRED_source", 400);
  const amount = money(b.amount);
  if (!Number.isFinite(amount) || amount < 0 || amount > 100000000) throw new AppError("ERR_INVALID_PARAMETER", 400);
  return { month, source, campaign: clip(b.campaign, 120) || null, amount, note: clip(b.note, 300) || null };
};

// `repeat` (1 to 12) records the same amount in that many consecutive months (a monthly contract)
export const createSpend = async (req: Request, res: Response): Promise<Response> => {
  const data = fields(req.body || {});
  const repeat = Math.min(12, Math.max(1, Math.round(Number(req.body?.repeat) || 1)));
  let first: MarketingSpend | null = null;
  for (let i = 0; i < repeat; i += 1) {
    const [y, m] = data.month.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 1 + i, 1));
    const month = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    // eslint-disable-next-line no-await-in-loop
    const row = await MarketingSpend.create({ ...data, month, createdBy: uid(req) } as any);
    if (!first) first = row;
  }
  return res.status(201).json({ ...present(first as MarketingSpend), created: repeat });
};

export const updateSpend = async (req: Request, res: Response): Promise<Response> => {
  const row = await MarketingSpend.findByPk(req.params.id);
  if (!row) throw new AppError("ERR_NOT_FOUND", 404);
  await row.update(fields({ ...present(row), ...(req.body || {}) }) as any);
  return res.json(present(row));
};

export const removeSpend = async (req: Request, res: Response): Promise<Response> => {
  const row = await MarketingSpend.findByPk(req.params.id);
  if (!row) throw new AppError("ERR_NOT_FOUND", 404);
  await row.destroy();
  return res.json({ ok: true });
};

// ------------------------------------------------------------------ cost per lead and per enrollment
// By source: the leads that arrived in the period, the enrollments confirmed in it and the money spent in its months.
// "Cost per enrollment" (CAC) = spent / enrollments of the period. A source with spending and no enrollment shows no CAC
// (it would be infinite), and one without spending shows no cost.
const ratio = (a: number, b: number): number | null => (a > 0 && b > 0 ? Math.round((a / b) * 100) / 100 : null);

export const cac = async (req: Request, res: Response): Promise<Response> => {
  const { from, to, start, end } = periodOf(req.query);
  const fm = from.slice(0, 7);
  const tm = to.slice(0, 7);
  const q = (sql: string) => sequelize.query(sql, { replacements: { start, end, fm, tm }, type: QueryTypes.SELECT }) as Promise<any[]>;

  const leads = await q(`SELECT COALESCE(NULLIF(source, ''), 'Outro') AS k, count(*)::int AS n FROM "Leads" WHERE "createdAt" BETWEEN :start AND :end AND "isHistorical" = false GROUP BY 1`);
  const won = await q(`SELECT COALESCE(NULLIF(source, ''), 'Outro') AS k, count(*)::int AS n FROM "Leads" WHERE "wonAt" BETWEEN :start AND :end GROUP BY 1`);
  const spent = await q(`SELECT source AS k, sum(amount)::float AS n FROM "MarketingSpends" WHERE month BETWEEN :fm AND :tm GROUP BY 1`);
  const campLeads = await q(`SELECT "utmCampaign" AS k, count(*)::int AS n FROM "Leads" WHERE "createdAt" BETWEEN :start AND :end AND "isHistorical" = false AND COALESCE("utmCampaign", '') <> '' GROUP BY 1`);
  const campWon = await q(`SELECT "utmCampaign" AS k, count(*)::int AS n FROM "Leads" WHERE "wonAt" BETWEEN :start AND :end AND COALESCE("utmCampaign", '') <> '' GROUP BY 1`);
  const campSpent = await q(`SELECT campaign AS k, sum(amount)::float AS n FROM "MarketingSpends" WHERE month BETWEEN :fm AND :tm AND COALESCE(campaign, '') <> '' GROUP BY 1`);

  const build = (a: any[], b: any[], c: any[]) => {
    const get = (rows: any[], k: string) => Number(rows.find(r => r.k === k)?.n || 0);
    const keys = [...new Set([...a, ...b, ...c].map(r => r.k))];
    return keys
      .map(k => {
        const l = get(a, k);
        const w = get(b, k);
        const s = Math.round(get(c, k) * 100) / 100;
        return { name: k, leads: l, enrolled: w, spent: s, costPerLead: ratio(s, l), cac: ratio(s, w), conversion: l > 0 ? Math.round((Math.min(w, l) / l) * 1000) / 10 : null };
      })
      .sort((x, y) => y.enrolled - x.enrolled || y.leads - x.leads);
  };
  const bySource = build(leads, won, spent);

  // month by month: the trend needs no tracking at all (everything spent against everything that came in)
  const tz = getAppTz();
  const monthOf = (col: string) => `to_char(${col} AT TIME ZONE '${tz}', 'YYYY-MM')`;
  const mLeads = await q(`SELECT ${monthOf('"createdAt"')} AS k, count(*)::int AS n FROM "Leads" WHERE "createdAt" BETWEEN :start AND :end AND "isHistorical" = false GROUP BY 1`);
  const mWon = await q(`SELECT ${monthOf('"wonAt"')} AS k, count(*)::int AS n FROM "Leads" WHERE "wonAt" BETWEEN :start AND :end GROUP BY 1`);
  const mSpent = await q(`SELECT month AS k, sum(amount)::float AS n FROM "MarketingSpends" WHERE month BETWEEN :fm AND :tm GROUP BY 1`);
  const months: string[] = [];
  for (let [y, m] = fm.split("-").map(Number); y < Number(tm.slice(0, 4)) || (y === Number(tm.slice(0, 4)) && m <= Number(tm.slice(5))); m += 1) {
    if (m > 12) { m = 1; y += 1; }
    months.push(`${y}-${String(m).padStart(2, "0")}`);
    if (months.length > 36) break;
  }
  const pick = (rows: any[], k: string) => Number(rows.find(r => r.k === k)?.n || 0);
  const monthly = months.map(k => {
    const l = pick(mLeads, k);
    const w = pick(mWon, k);
    const sp = Math.round(pick(mSpent, k) * 100) / 100;
    return { month: k, leads: l, enrolled: w, spent: sp, costPerLead: ratio(sp, l), cac: ratio(sp, w) };
  });

  // where the money went, by channel; a channel that leaves a trace in the lead's origin also shows its own results
  const spentByChannel = await q(`SELECT source AS k, sum(amount)::float AS n FROM "MarketingSpends" WHERE month BETWEEN :fm AND :tm GROUP BY 1 ORDER BY 2 DESC`);
  const totalSpent = spentByChannel.reduce((t, r) => t + Number(r.n), 0);
  const byChannel = spentByChannel.map(r => {
    const sp = Math.round(Number(r.n) * 100) / 100;
    const sources = sourcesOfChannel(r.k);
    const l = sources.reduce((t, name) => t + Number(leads.find(x => x.k === name)?.n || 0), 0);
    const w = sources.reduce((t, name) => t + Number(won.find(x => x.k === name)?.n || 0), 0);
    return {
      name: r.k,
      spent: sp,
      share: totalSpent > 0 ? Math.round((sp / totalSpent) * 1000) / 10 : 0,
      trackable: sources.length > 0,
      sources,
      leads: sources.length ? l : null,
      enrolled: sources.length ? w : null,
      costPerLead: sources.length ? ratio(sp, l) : null,
      cac: sources.length ? ratio(sp, w) : null
    };
  });
  const sum = (k: "leads" | "enrolled" | "spent") => bySource.reduce((t, r) => t + (r[k] as number), 0);
  const total = { leads: sum("leads"), enrolled: sum("enrolled"), spent: Math.round(sum("spent") * 100) / 100 };
  return res.json({
    from,
    to,
    sources: [...new Set([...CRM_OPTIONS.sources, ...bySource.map(r => r.name)])],
    total: { ...total, costPerLead: ratio(total.spent, total.leads), cac: ratio(total.spent, total.enrolled) },
    channels: MARKETING_CHANNELS.map(c => ({ name: c.name, hint: c.hint, trackable: c.sources.length > 0 })),
    monthly,
    byChannel,
    bySource,
    byCampaign: build(campLeads, campWon, campSpent)
  });
};
