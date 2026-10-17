import { Request, Response } from "express";

import AppError from "../errors/AppError";
import { dayBounds, shiftDays, todayInAppTz } from "../helpers/AppTime";
import { setSetting } from "../helpers/AppSettings";
import { isManagerRole, roleOf } from "../helpers/Roles";
import Lead from "../models/Lead";
import { runCadences } from "../services/CrmServices/Cadences";
import { NPS_KINDS, npsSummary, readNpsConfig, sendSurvey } from "../services/CrmServices/Nps";
import { Scope, markReenrolled, readRetentionConfig, rematriculaList, riskStudents, sendRetentionMessage } from "../services/CrmServices/Retention";

const uid = (req: Request): number => Number(req.user.id);

// The management sees every student; a tutor only the ones they follow; nobody else comes in here.
const scopeOf = (req: Request): Scope => {
  const role = roleOf(req.user);
  if (isManagerRole(role)) return {};
  if (role === "tutor" || role === "academico") return { tutorId: uid(req) };
  throw new AppError("ERR_NO_PERMISSION", 403);
};

const leadOf = async (req: Request): Promise<Lead> => {
  const scope = scopeOf(req);
  const lead = await Lead.findByPk(req.params.leadId);
  if (!lead) throw new AppError("ERR_LEAD_NOT_FOUND", 404);
  if (scope.tutorId && lead.onboardingTutorId !== scope.tutorId) throw new AppError("ERR_NO_PERMISSION", 403);
  return lead;
};

const period = (q: any) => {
  const today = todayInAppTz();
  const from = /^\d{4}-\d{2}-\d{2}$/.test(String(q.from || "")) ? String(q.from) : shiftDays(dayBounds(today).start, -89).toLocaleDateString("en-CA", { timeZone: "America/Porto_Velho" });
  const to = /^\d{4}-\d{2}-\d{2}$/.test(String(q.to || "")) ? String(q.to) : today;
  return { from, to, start: dayBounds(from).start, end: dayBounds(to).end };
};

// ------------------------------------------------------------------ satisfaction
export const nps = async (req: Request, res: Response): Promise<Response> => {
  scopeOf(req);
  const p = period(req.query);
  return res.json({ from: p.from, to: p.to, ...(await npsSummary(p.start, p.end)) });
};

export const sendNps = async (req: Request, res: Response): Promise<Response> => {
  const lead = await leadOf(req);
  if (!lead.enrolledAt) throw new AppError("ERR_LEAD_NOT_ENROLLED", 400);
  const survey = await sendSurvey(lead, "manual", uid(req));
  return res.status(201).json({ id: survey.id });
};

// ------------------------------------------------------------------ risk of dropping out
export const risk = async (req: Request, res: Response): Promise<Response> => res.json(await riskStudents(scopeOf(req)));

export const riskMessage = async (req: Request, res: Response): Promise<Response> => {
  const lead = await leadOf(req);
  await sendRetentionMessage(lead, uid(req));
  return res.json({ ok: true });
};

// ------------------------------------------------------------------ re-enrollment
export const rematricula = async (req: Request, res: Response): Promise<Response> => res.json(await rematriculaList(scopeOf(req)));

export const setRematricula = async (req: Request, res: Response): Promise<Response> => {
  const lead = await leadOf(req);
  await markReenrolled(lead, uid(req), !!req.body.undo);
  return res.json({ ok: true });
};

// ------------------------------------------------------------------ settings (management)
const configView = async () => {
  const [n, r] = await Promise.all([readNpsConfig(), readRetentionConfig()]);
  return { nps: n, npsKinds: NPS_KINDS, risk: { days: r.riskDays, message: r.riskMessage }, rematricula: r.rematricula };
};

export const getConfig = async (req: Request, res: Response): Promise<Response> => {
  scopeOf(req);
  return res.json(await configView());
};

export const putConfig = async (req: Request, res: Response): Promise<Response> => {
  const b = req.body || {};
  if (b.nps) {
    if (b.nps.enabled !== undefined) await setSetting("nps_enabled", b.nps.enabled ? "true" : "false");
    if (Array.isArray(b.nps.moments)) await setSetting("nps_moments", JSON.stringify(b.nps.moments.filter((m: any) => (NPS_KINDS as readonly string[]).includes(m))));
    if (typeof b.nps.question === "string") await setSetting("nps_question", b.nps.question.trim().slice(0, 500));
  }
  if (b.risk) {
    if (b.risk.days !== undefined) await setSetting("retention_risk_days", String(Math.min(365, Math.max(7, Math.round(Number(b.risk.days) || 30)))));
    if (typeof b.risk.message === "string") await setSetting("retention_risk_message", b.risk.message.trim().slice(0, 500));
  }
  if (b.rematricula) {
    const cur = (await readRetentionConfig()).rematricula;
    const date = (v: any, fallback: string) => (v === undefined ? fallback : /^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? String(v) : "");
    const term = b.rematricula.term === undefined ? cur.term : /^20\d{2}\/[12]$/.test(String(b.rematricula.term)) ? String(b.rematricula.term) : "";
    const startsAt = date(b.rematricula.startsAt, cur.startsAt);
    const endsAt = date(b.rematricula.endsAt, cur.endsAt);
    if (startsAt && endsAt && startsAt > endsAt) throw new AppError("ERR_INVALID_PARAMETER", 400);
    await setSetting("retention_rematricula", JSON.stringify({
      term,
      startsAt,
      endsAt,
      auto: b.rematricula.auto === undefined ? cur.auto : !!b.rematricula.auto,
      message: typeof b.rematricula.message === "string" ? b.rematricula.message.trim().slice(0, 500) : cur.message
    }));
  }
  return res.json(await configView());
};

// runs every follow-up now (the worker does it every ten minutes)
export const runNow = async (_req: Request, res: Response): Promise<Response> => res.json(await runCadences());
