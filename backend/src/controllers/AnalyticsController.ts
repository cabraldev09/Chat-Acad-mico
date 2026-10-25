import { Request, Response } from "express";

import AppError from "../errors/AppError";
import { isManagerRole, roleOf } from "../helpers/Roles";
import { KPI_DEFINITIONS } from "../services/AnalyticsServices/definitions";
import { focusFor } from "../services/AnalyticsServices/Focus";
import { remember } from "../helpers/TtlCache";
import {
  alertsOf, bundlesFor, byPolo, canSeeConsultant, getConfig, resolvePeriod, saveConfig, totalsOf, unassignedTasks, visibleConsultantIds
} from "../services/AnalyticsServices/AnalyticsService";

const period = (req: Request) => {
  const p = resolvePeriod(req.query);
  return { range: p.range, from: p.from, to: p.to, start: p.start.toISOString(), end: p.end.toISOString() };
};

export const definitions = async (_req: Request, res: Response): Promise<Response> => res.json({ kpis: KPI_DEFINITIONS });

// "My numbers": ALWAYS the requester's own. Nothing in the URL or the query chooses whose numbers are read.
export const me = async (req: Request, res: Response): Promise<Response> => {
  const p = resolvePeriod(req.query);
  const id = Number(req.user.id);
  const [bundle] = await bundlesFor([id], p);
  const config = await getConfig();
  return res.json({ period: period(req), ...bundle, targets: { dailyMessages: config.dailyMessagesTarget, dailyAttendances: config.dailyAttendancesTarget }, focus: await focusFor(id) });
};

// One consultant seen by the management: the very same bundle the person reads in /analytics/me
export const consultant = async (req: Request, res: Response): Promise<Response> => {
  const target = Number(req.params.userId);
  if (!Number.isInteger(target) || !(await canSeeConsultant(req.user, target))) throw new AppError("ERR_NO_PERMISSION", 403);
  const p = resolvePeriod(req.query);
  const [bundle] = await bundlesFor([target], p);
  const config = await getConfig();
  return res.json({ period: period(req), ...bundle, targets: { dailyMessages: config.dailyMessagesTarget, dailyAttendances: config.dailyAttendancesTarget }, focus: await focusFor(target) });
};

// The management center: only the consultants the requester is allowed to see
export const team = async (req: Request, res: Response): Promise<Response> => {
  if (!isManagerRole(roleOf(req.user))) throw new AppError("ERR_NO_PERMISSION", 403);
  const p = resolvePeriod(req.query);
  // the screen asks again on every tab change and on every reconnection: a few seconds of memory spares the database the whole count
  const key = `analytics-team:${req.user.id}:${p.from}:${p.to}`;
  return res.json(await remember(key, Number(process.env.DASHBOARD_CACHE_MS ?? 10000), async () => {
    const ids = await visibleConsultantIds(req.user);
    const bundles = await bundlesFor(ids, p);
    const config = await getConfig();
    return {
      period: period(req),
      consultants: bundles,
      totals: totalsOf(bundles),
      polos: await byPolo(bundles),
      alerts: alertsOf(bundles, config),
      unassigned: await unassignedTasks(),
      config
    };
  }));
};

export const getAnalyticsConfig = async (_req: Request, res: Response): Promise<Response> => res.json(await getConfig());
export const putAnalyticsConfig = async (req: Request, res: Response): Promise<Response> => res.json(await saveConfig(req.body));

const csvCell = (v: any): string => {
  let s = v === null || v === undefined ? "" : String(v);
  // a cell that starts like a formula is text, never a formula
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
};

export const exportTeam = async (req: Request, res: Response): Promise<void> => {
  if (!isManagerRole(roleOf(req.user))) throw new AppError("ERR_NO_PERMISSION", 403);
  const p = resolvePeriod(req.query);
  const bundles = await bundlesFor(await visibleConsultantIds(req.user), p, { goals: false });
  const keys = KPI_DEFINITIONS.map(k => k.key);
  const lines = [["Consultor", ...KPI_DEFINITIONS.map(k => k.label)].map(csvCell).join(";")];
  bundles.forEach(b => lines.push([b.user.name, ...keys.map(k => (b.metrics as any)[k])].map(csvCell).join(";")));
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="gestao-comercial-${p.from}-${p.to}.csv"`);
  res.send(`﻿${lines.join("\r\n")}`);
};
