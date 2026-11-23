import { analyticsInstitutionId, analyticsInstitutionScope } from "../services/AnalyticsServices/AnalyticsService";
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
  return res.json({ period: period(req), ...bundle, targets: { dailyMessages: config.dailyMessagesTarget, dailyAttendances: config.dailyAttendancesTarget }, focus: await focusFor(id, analyticsInstitutionScope()) });
};

// One consultant seen by the management: the very same bundle the person reads in /analytics/me
export const consultant = async (req: Request, res: Response): Promise<Response> => {
  const target = Number(req.params.userId);
  if (!Number.isInteger(target) || !(await canSeeConsultant(req.user, target))) throw new AppError("ERR_NO_PERMISSION", 403);
  const p = resolvePeriod(req.query);
  const [bundle] = await bundlesFor([target], p);
  const config = await getConfig();
  return res.json({ period: period(req), ...bundle, targets: { dailyMessages: config.dailyMessagesTarget, dailyAttendances: config.dailyAttendancesTarget }, focus: await focusFor(target, analyticsInstitutionScope()) });
};

// The management center: only the consultants the requester is allowed to see
export const team = async (req: Request, res: Response): Promise<Response> => {
  if (!isManagerRole(roleOf(req.user))) throw new AppError("ERR_NO_PERMISSION", 403);
  const p = resolvePeriod(req.query);
  // the screen asks again on every tab change and on every reconnection: a few seconds of memory spares the database the whole count
  const key = `analytics-team:${req.user.id}:${p.from}:${p.to}:${analyticsInstitutionId() || 0}`;
  return res.json(await remember(key, Number(process.env.DASHBOARD_CACHE_MS ?? 10000), async () => {
    const ids = await visibleConsultantIds(req.user);
    const bundles = await bundlesFor(ids, p);
    const config = await getConfig();
    return {
      period: period(req),
      consultants: bundles,
      totals: totalsOf(bundles),
      polos: await byPolo(bundles),
      alerts: await withCoaching(alertsOf(bundles, config), bundles.map(b => ({ id: b.user.id, name: b.user.name }))),
      unassigned: await unassignedTasks(),
      config
    };
  }));
};

// what the daily review of the AI found repeating goes into the same list, ordered by how urgent it is
const withCoaching = async (alerts: any[], users: Array<{ id: number; name: string }>): Promise<any[]> => {
  try {
    const { recentCoaching, coachingAlerts } = await import("../services/AnalyticsServices/ConsultantReview");
    const order: Record<string, number> = { high: 0, medium: 1, low: 2 };
    return [...alerts, ...coachingAlerts(await recentCoaching(users, await stepLabelOf()))].sort((a, b) => order[a.level] - order[b.level]);
  } catch (_) {
    return alerts;
  }
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


// "Atendimento e processo": per consultant, conversations, messages, audios, grades, process followed and where the leads stopped
const stepLabelOf = async (): Promise<(key: string) => string> => {
  const { configOf } = await import("../services/CopilotServices/Settings");
  const { STEP_LABEL } = await import("../services/CommercialServices/Process");
  const config = await configOf();
  const labels = new Map(config.steps.map(s => [s.key, s.label]));
  return (key: string) => labels.get(key) || (STEP_LABEL as any)[key] || key;
};
export const processTeam = async (req: Request, res: Response): Promise<Response> => {
  if (!isManagerRole(roleOf(req.user))) throw new AppError("ERR_NO_PERMISSION", 403);
  const p = resolvePeriod(req.query);
  const ids = await visibleConsultantIds(req.user);
  const User = (await import("../models/User")).default;
  const users = ids.length ? (await User.findAll({ where: { id: ids }, attributes: ["id", "name"], order: [["name", "ASC"]] })).map(u => ({ id: u.id, name: u.name })) : [];
  const { processMetrics } = await import("../services/AnalyticsServices/ProcessMetrics");
  return res.json({ period: period(req), consultants: await processMetrics(users, p, await stepLabelOf()) });
};
export const processConsultant = async (req: Request, res: Response): Promise<Response> => {
  const target = Number(req.params.userId);
  if (!Number.isInteger(target) || !(await canSeeConsultant(req.user, target))) throw new AppError("ERR_NO_PERMISSION", 403);
  const { consultantLeads } = await import("../services/AnalyticsServices/ProcessMetrics");
  return res.json({ period: period(req), leads: await consultantLeads(target, resolvePeriod(req.query), await stepLabelOf()) });
};

// whose numbers a commercial view reads: the management, the consultants it may see (a polo or one person narrows it);
// anybody else, only their own, whatever the query says
const commercialUsers = async (req: Request): Promise<Array<{ id: number; name: string }>> => {
  const User = (await import("../models/User")).default;
  let ids: number[];
  if (isManagerRole(roleOf(req.user))) {
    ids = await visibleConsultantIds(req.user);
    const poloId = Number(req.query.poloId);
    if (Number.isInteger(poloId) && poloId > 0) {
      const PoloMember = (await import("../models/PoloMember")).default;
      const inPolo = new Set((await PoloMember.findAll({ where: { poloId }, attributes: ["userId"] })).map(m => m.userId));
      ids = ids.filter(id => inPolo.has(id));
    }
    const one = Number(req.query.userId);
    if (Number.isInteger(one) && one > 0) {
      if (!(await canSeeConsultant(req.user, one))) throw new AppError("ERR_NO_PERMISSION", 403);
      ids = [one];
    }
  } else ids = [Number(req.user.id)];
  return ids.length ? (await User.findAll({ where: { id: ids }, attributes: ["id", "name"], order: [["name", "ASC"]] })).map(u => ({ id: u.id, name: u.name })) : [];
};

// "Estatísticas → Comercial": where the leads stop, objections, sales by city and course, grades, audio and the process followed
export const commercial = async (req: Request, res: Response): Promise<Response> => {
  const p = resolvePeriod(req.query);
  const users = await commercialUsers(req);
  const key = `analytics-commercial:${req.user.id}:${p.from}:${p.to}:${users.map(u => u.id).join(",")}:${analyticsInstitutionId() || 0}`;
  return res.json(await remember(key, Number(process.env.DASHBOARD_CACHE_MS ?? 10000), async () => {
    const { configOf } = await import("../services/CopilotServices/Settings");
    const { salesInsights } = await import("../services/AnalyticsServices/SalesInsights");
    const steps = (await configOf()).steps.map((s: any) => ({ key: s.key, label: s.label, optional: !!s.optional }));
    return { period: period(req), ...(await salesInsights(users, p, steps)) };
  }));
};

// ---------------------------------------------------------------- training: what the daily review of the AI found repeating per consultant
const COACHING_TEXT_TTL = 24 * 60 * 60 * 1000;

export const coaching = async (req: Request, res: Response): Promise<Response> => {
  if (!isManagerRole(roleOf(req.user))) throw new AppError("ERR_NO_PERMISSION", 403);
  const p = resolvePeriod({ range: req.query.range || "custom", from: req.query.from, to: req.query.to });
  const users = await commercialUsers(req);
  const { coachingFor, COACHING_MIN_REVIEWS } = await import("../services/AnalyticsServices/ConsultantReview");
  const list = await coachingFor(users, p.start, p.end, await stepLabelOf());
  const { getSetting } = await import("../helpers/AppSettings");
  return res.json({
    period: period(req),
    minReviews: COACHING_MIN_REVIEWS,
    enabled: (await getSetting("consultant_review_enabled", "true")) !== "false",
    lastRun: (await getSetting("consultant_review_last", "")) || null,
    consultants: list
  });
};

// one short training suggestion per consultant, written by the AI from the codes found (no names, no conversation text leave here)
export const coachingText = async (req: Request, res: Response): Promise<Response> => {
  if (!isManagerRole(roleOf(req.user))) throw new AppError("ERR_NO_PERMISSION", 403);
  const p = resolvePeriod({ range: req.body?.range || "custom", from: req.body?.from, to: req.body?.to });
  const users = await commercialUsers(req);
  const { coachingFor } = await import("../services/AnalyticsServices/ConsultantReview");
  const list = (await coachingFor(users, p.start, p.end, await stepLabelOf())).filter(c => c.items.length);
  if (!list.length) return res.json({ tips: [] });
  const key = `coaching-text:${p.from}:${p.to}:${list.map(c => `${c.userId}-${c.items.map(i => `${i.kind}${i.key}${i.hits}`).join("")}`).join(",")}`;
  return res.json(await remember(key, COACHING_TEXT_TTL, async () => {
    const AiAgent = (await import("../models/AiAgent")).default;
    const { askOnce, resolveKey } = await import("../services/AiServices/RunAiAgent");
    const agent = await AiAgent.findOne({ where: { provider: "openai", active: true } as any, order: [["id", "ASC"]] });
    if (!agent) throw new AppError("ERR_AI_SUPERVISOR_UNAVAILABLE", 503);
    const apiKey = await resolveKey(agent);
    if (!apiKey) throw new AppError("ERR_AI_NO_API_KEY", 400);
    const input = list.map((c, i) => ({ i, reviewed: c.reviewed, problems: c.items.map(it => it.text) }));
    let parsed: any;
    try {
      const answer = await askOnce(agent, apiKey,
        "Você orienta a gestão comercial de uma faculdade. Para cada pessoa (identificada só por um número), escreva UMA sugestão de treinamento prática, em português, com no máximo 160 caracteres, baseada apenas nos problemas listados. Responda só com JSON válido no formato {\"tips\":[{\"i\":numero,\"text\":string}]}.",
        JSON.stringify(input), 400, { kind: "copilot" });
      parsed = JSON.parse(String(answer.text || "").replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim());
    } catch (err) {
      const code = String((err as Error)?.message || "");
      if (/ERR_AI_TOKEN_CAP|ERR_AI_RATE_REQUIRED/.test(code)) throw new AppError("ERR_COPILOT_TOKEN_LIMIT", 429);
      throw new AppError("ERR_AI_BAD_ANSWER", 502);
    }
    const tips = (Array.isArray(parsed?.tips) ? parsed.tips : [])
      .filter((t: any) => Number.isInteger(t?.i) && list[t.i] && typeof t.text === "string" && t.text.trim())
      .map((t: any) => ({ userId: list[t.i].userId, text: String(t.text).trim().slice(0, 200) }));
    return { tips, generatedAt: new Date().toISOString() };
  }));
};

// an administrator reads the conversations of a day now (the same reading the night does), e.g. to see the result right after turning it on
export const coachingRun = async (req: Request, res: Response): Promise<Response> => {
  const { todayInAppTz } = await import("../helpers/AppTime");
  const day = /^\d{4}-\d{2}-\d{2}$/.test(String(req.body?.day || "")) ? String(req.body.day) : todayInAppTz();
  const { runConsultantReview } = await import("../workers/ConsultantReview");
  return res.json({ day, ...(await runConsultantReview(day)) });
};

// "Estatísticas → Tutoria": the management sees every tutor; a tutor or the academic team sees only their own students
export const tutoria = async (req: Request, res: Response): Promise<Response> => {
  const role = roleOf(req.user);
  const manager = isManagerRole(role);
  if (!manager && !["tutor", "academico"].includes(role)) throw new AppError("ERR_NO_PERMISSION", 403);
  const p = resolvePeriod(req.query);
  // Coordination sees tutoring aggregates only for polos explicitly assigned to that coordinator.
  // Administrators retain the group-wide view defined by the current management policy.
  let poloIds: number[] | null = null;
  if (role === "coordenacao") {
    const PoloMember = (await import("../models/PoloMember")).default;
    poloIds = (await PoloMember.findAll({ where: { userId: Number(req.user.id), role: "coordenacao" }, attributes: ["poloId"] })).map(m => Number(m.poloId));
  }
  const { tutoriaInsights } = await import("../services/AnalyticsServices/TutoriaInsights");
  const insights = await tutoriaInsights(manager ? null : [Number(req.user.id)], p.start, p.end, poloIds);
  let panel: any = null;
  if (manager) {
    const { tutorPanel } = await import("../services/TutoriaServices/Students");
    panel = await tutorPanel(p.start, p.end, poloIds);
  }
  return res.json({ period: period(req), scope: role === "coordenacao" ? "authorized-polos" : manager ? "all" : "mine", ...insights, panel });
};

// ---------------------------------------------------------------- insights and who is online (Painel do CRM and Estatísticas)
// short sentences from real data, each with where to act: the management reads its team, a consultant reads their own leads
export const insights = async (req: Request, res: Response): Promise<Response> => {
  const { insightsFor } = await import("../services/AnalyticsServices/Insights");
  const key = `analytics-insights:${req.user.id}:${analyticsInstitutionId() || 0}`;
  return res.json({ items: await remember(key, Number(process.env.DASHBOARD_CACHE_MS ?? 10000), () => insightsFor(req.user)) });
};

// who is using the system now (a request in the last 5 minutes) and the last access of each person; management only
export const online = async (req: Request, res: Response): Promise<Response> => {
  if (!isManagerRole(roleOf(req.user))) throw new AppError("ERR_NO_PERMISSION", 403);
  const { teamOnline } = await import("../services/AnalyticsServices/Insights");
  return res.json({ users: await teamOnline(req.user) });
};

// "Meu desempenho": everything about the person who asks, and only them (nothing in the query chooses whose numbers are read):
// production and goals (the same bundle as /analytics/me), the leads now, what to do (insights of their own leads and conversations),
// the commercial results against the period before, the training the daily review found for them and tips against the team average
export const meOverview = async (req: Request, res: Response): Promise<Response> => {
  const id = Number(req.user.id);
  const p = resolvePeriod(req.query);
  const { computeMetrics } = await import("../services/AnalyticsServices/AnalyticsService");
  const { myLeads, teamAverages, gradesSentBy, tipsFor } = await import("../services/AnalyticsServices/Performance");
  const { insightsFor } = await import("../services/AnalyticsServices/Insights");
  const { focusFor } = await import("../services/AnalyticsServices/Focus");
  const length = p.end.getTime() - p.start.getTime();
  const before = { ...p, start: new Date(p.start.getTime() - length), end: new Date(p.start.getTime() - 1) };
  const [[bundle], config, leads, insights, focus, team, grades, previous] = await Promise.all([
    bundlesFor([id], p), getConfig(), myLeads(id), insightsFor(req.user, new Date(), { selfOnly: true }), focusFor(id, analyticsInstitutionScope()),
    teamAverages(p), gradesSentBy(id, p), computeMetrics([id], before as any)
  ]);
  const { coachingFor } = await import("../services/AnalyticsServices/ConsultantReview");
  const [coaching] = await coachingFor([{ id, name: "" }], p.start, p.end, await stepLabelOf()).catch(() => [] as any[]);
  return res.json({
    period: period(req),
    ...bundle,
    targets: { dailyMessages: config.dailyMessagesTarget, dailyAttendances: config.dailyAttendancesTarget },
    focus,
    leads,
    insights,
    results: { now: { ...bundle.metrics, gradesSent: grades }, before: previous.get(id) || null },
    team,
    tips: tipsFor({ metrics: bundle.metrics, grades }, team),
    coaching: coaching ? { reviewed: coaching.reviewed, items: coaching.items || [], strengths: coaching.strengths || [] } : null
  });
};
