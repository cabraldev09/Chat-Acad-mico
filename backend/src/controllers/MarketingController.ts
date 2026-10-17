import { Request, Response } from "express";
import { QueryTypes } from "sequelize";

import sequelize from "../database";
import AppError from "../errors/AppError";
import { dayBounds, shiftDays } from "../helpers/AppTime";
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

export const createSpend = async (req: Request, res: Response): Promise<Response> => {
  const row = await MarketingSpend.create({ ...fields(req.body || {}), createdBy: uid(req) } as any);
  return res.status(201).json(present(row));
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
const ratio = (a: number, b: number): number | null => (b > 0 ? Math.round((a / b) * 100) / 100 : null);

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
  const sum = (k: "leads" | "enrolled" | "spent") => bySource.reduce((t, r) => t + (r[k] as number), 0);
  const total = { leads: sum("leads"), enrolled: sum("enrolled"), spent: Math.round(sum("spent") * 100) / 100 };
  return res.json({
    from,
    to,
    sources: [...new Set([...CRM_OPTIONS.sources, ...bySource.map(r => r.name)])],
    total: { ...total, costPerLead: ratio(total.spent, total.leads), cac: ratio(total.spent, total.enrolled) },
    bySource,
    byCampaign: build(campLeads, campWon, campSpent)
  });
};
