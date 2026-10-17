import { Request, Response } from "express";

import AppError from "../errors/AppError";
import { dayBounds, shiftDays, todayInAppTz } from "../helpers/AppTime";
import { setSetting } from "../helpers/AppSettings";
import { isManagerRole, roleOf } from "../helpers/Roles";
import Lead from "../models/Lead";
import { runCadences } from "../services/CrmServices/Cadences";
import { GROUP_OPTIONS, NPS_KINDS, npsAnswers, npsSummary, readNpsConfig, sendSurvey } from "../services/CrmServices/Nps";
import { renderRetentionText } from "../services/CrmServices/RetentionLog";
import { retentionLog, retentionOperations, searchStudents } from "../services/CrmServices/RetentionOps";
import { Scope, markReenrolled, readRetentionConfig, rematriculaList, riskStudents, sendRetentionMessage } from "../services/CrmServices/Retention";
import { csvAsText, csvDay, sendCsv } from "../helpers/Csv";

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
  return res.json({ from: p.from, to: p.to, ...(await npsSummary(p.start, p.end, scopeOf(req).tutorId)) });
};

const KIND_LABEL: Record<string, string> = { onboarding: "Após a ambientação", d30: "30 dias de matrícula", d90: "90 dias de matrícula", manual: "Manual" };
const CATEGORY_LABEL: Record<string, string> = { promoter: "Promotor", neutral: "Neutro", detractor: "Detrator" };

export const npsCsv = async (req: Request, res: Response): Promise<Response> => {
  const scope = scopeOf(req);
  const p = period(req.query);
  const rows = await npsAnswers(p.start, p.end, scope.tutorId);
  return sendCsv(res, `satisfacao-${p.from}-a-${p.to}.csv`, ["Data", "Aluno", "Momento", "Nota", "Classificação", "Motivo"],
    rows.map(r => [csvDay(r.at), r.lead, KIND_LABEL[r.kind] || r.kind, r.score, CATEGORY_LABEL[r.category], r.comment]));
};

// the three numbers on top of the screen (and the badge of each tab)
export const summary = async (req: Request, res: Response): Promise<Response> => {
  const scope = scopeOf(req);
  const today = todayInAppTz();
  const from = dayBounds(shiftDays(dayBounds(today).start, -29)).start;
  const [risk, remat, n, ops] = await Promise.all([riskStudents(scope, 1000), rematriculaList(scope), npsSummary(from, dayBounds(today).end, scope.tutorId), retentionOperations(scope, from, dayBounds(today).end)]);
  return res.json({
    risk: { days: risk.riskDays, total: risk.total, high: risk.students.filter(s => s.level === "high").length, attention: risk.students.filter(s => s.level === "attention").length },
    rematricula: { term: remat.config.term, window: remat.window, daysLeft: remat.daysLeft, pending: remat.pending, done: remat.done, rate: remat.rate },
    nps: { days: 30, value: n.nps, answered: n.answered, detractors: n.detractors, detractorsOpen: ops.survey.pending }
  });
};

export const sendNps = async (req: Request, res: Response): Promise<Response> => {
  const lead = await leadOf(req);
  if (!lead.enrolledAt) throw new AppError("ERR_LEAD_NOT_ENROLLED", 400);
  const survey = await sendSurvey(lead, "manual", uid(req));
  return res.status(201).json({ id: survey.id });
};

// ------------------------------------------------------------------ risk of dropping out
export const risk = async (req: Request, res: Response): Promise<Response> => res.json(await riskStudents(scopeOf(req)));

export const riskCsv = async (req: Request, res: Response): Promise<Response> => {
  const { students } = await riskStudents(scopeOf(req), 1000);
  return sendCsv(res, `alunos-em-risco-${todayInAppTz()}.csv`, ["Aluno", "Polo", "Tutor", "Dias sem notícias", "Nível", "Última notícia", "Mensagem de retenção enviada em"],
    students.map(s => [s.name, s.polo || "", s.tutor || "", s.days, s.level === "high" ? "Alto" : "Atenção", csvDay(s.last), csvDay(s.messagedAt)]));
};

export const riskMessage = async (req: Request, res: Response): Promise<Response> => {
  const lead = await leadOf(req);
  await sendRetentionMessage(lead, uid(req));
  return res.json({ ok: true });
};

// ------------------------------------------------------------------ re-enrollment
export const rematricula = async (req: Request, res: Response): Promise<Response> => res.json(await rematriculaList(scopeOf(req)));

export const rematriculaCsv = async (req: Request, res: Response): Promise<Response> => {
  const d = await rematriculaList(scopeOf(req), true);
  const rows = [
    ...d.pendingStudents.map(s => [s.name, s.polo || "", s.tutor || "", "Falta renovar", ""]),
    ...d.doneStudents.map(s => [s.name, s.polo || "", s.tutor || "", "Renovou", csvDay((s as any).at)])
  ];
  return sendCsv(res, `rematricula-${(d.config.term || "sem-periodo").replace("/", "-")}.csv`, ["Aluno", "Polo", "Tutor", "Situação", "Renovou em"], rows);
};

export const setRematricula = async (req: Request, res: Response): Promise<Response> => {
  const lead = await leadOf(req);
  await markReenrolled(lead, uid(req), !!req.body.undo);
  return res.json({ ok: true });
};

// ------------------------------------------------------------------ choosing who gets a message
// the enrolled students a person may write to (a tutor: only the ones they follow)
export const students = async (req: Request, res: Response): Promise<Response> => {
  const list = await searchStudents(scopeOf(req), String(req.query.search || ""), 30);
  return res.json(list);
};

const KINDS = ["nps", "risk", "remat", "custom"];
const KIND_NAME: Record<string, string> = { nps: "Pesquisa de satisfação", risk: "Mensagem de retenção", remat: "Aviso de rematrícula", custom: "Mensagem escrita na hora" };

// What a message looks like before it goes: the text with the first name of each chosen student, and the buttons when the
// connection is the official API. Nothing is sent.
export const preview = async (req: Request, res: Response): Promise<Response> => {
  const scope = scopeOf(req);
  const kind = String(req.body?.kind);
  if (!KINDS.includes(kind)) throw new AppError("ERR_INVALID_PARAMETER", 400);
  const [n, r] = await Promise.all([readNpsConfig(), readRetentionConfig()]);
  const extra: Record<string, string> = { periodo: r.rematricula.term || "2026/2" };
  const template = kind === "nps" ? n.question : kind === "risk" ? r.riskMessage : kind === "remat" ? r.rematricula.message : String(req.body?.text || "").trim();
  const ids: number[] = (Array.isArray(req.body?.leadIds) ? req.body.leadIds : []).map(Number).filter(Boolean).slice(0, 5);
  const leads = ids.length ? await Lead.findAll({ where: { id: ids }, attributes: ["id", "name", "onboardingTutorId"] }) : [];
  const allowed = leads.filter(l => !scope.tutorId || l.onboardingTutorId === scope.tutorId);
  const people = allowed.length ? allowed.map(l => ({ leadId: l.id, name: l.name })) : [{ leadId: null, name: "Maria Souza" }];
  return res.json({
    kind,
    title: KIND_NAME[kind],
    template,
    // the buttons only exist on the official API; on the other connections the student types the number
    buttons: kind === "nps" && n.buttons ? GROUP_OPTIONS.map(o => o.label) : [],
    samples: people.map(p => ({ leadId: p.leadId, name: p.name, text: renderRetentionText(template, p.name, extra) }))
  });
};

// Sends the chosen message to the chosen students, one by one, and says how each one went.
export const sendBulk = async (req: Request, res: Response): Promise<Response> => {
  const scope = scopeOf(req);
  const kind = String(req.body?.kind);
  if (!["nps", "risk", "custom"].includes(kind)) throw new AppError("ERR_INVALID_PARAMETER", 400);
  const text = String(req.body?.text || "").trim().slice(0, 1000);
  if (kind === "custom" && !text) throw new AppError("ERR_FIELD_REQUIRED_text", 400);
  const ids: number[] = [...new Set<number>((Array.isArray(req.body?.leadIds) ? req.body.leadIds : []).map(Number).filter(Boolean))];
  if (!ids.length) throw new AppError("ERR_FIELD_REQUIRED_leadIds", 400);
  if (ids.length > 50) throw new AppError("ERR_RETENTION_TOO_MANY", 400);

  const leads = await Lead.findAll({ where: { id: ids } });
  const results: Array<{ leadId: number; name: string | null; ok: boolean; error?: string }> = [];
  for (const id of ids) {
    const lead = leads.find(l => l.id === id);
    if (!lead) { results.push({ leadId: id, name: null, ok: false, error: "Aluno não encontrado." }); continue; }
    if (scope.tutorId && lead.onboardingTutorId !== scope.tutorId) { results.push({ leadId: id, name: lead.name, ok: false, error: "Este aluno não é seu." }); continue; }
    if (!lead.enrolledAt) { results.push({ leadId: id, name: lead.name, ok: false, error: "O aluno ainda não está matriculado." }); continue; }
    try {
      // eslint-disable-next-line no-await-in-loop
      if (kind === "nps") await sendSurvey(lead, "manual", uid(req));
      // eslint-disable-next-line no-await-in-loop
      else await sendRetentionMessage(lead, uid(req), kind === "custom" ? text : undefined);
      results.push({ leadId: id, name: lead.name, ok: true });
    } catch (err) {
      results.push({ leadId: id, name: lead.name, ok: false, error: String((err as Error).message || "Não foi possível enviar.") });
    }
  }
  return res.json({ sent: results.filter(r => r.ok).length, failed: results.filter(r => !r.ok).length, results });
};

// ------------------------------------------------------------------ the log and the numbers of the operation
export const log = async (req: Request, res: Response): Promise<Response> => {
  const p = period(req.query);
  const page = Math.max(1, Number(req.query.page) || 1);
  const out = await retentionLog(scopeOf(req), { from: p.start, to: p.end, kind: String(req.query.kind || ""), search: String(req.query.search || ""), limit: 25, offset: (page - 1) * 25 });
  return res.json({ from: p.from, to: p.to, page, ...out });
};

export const logCsv = async (req: Request, res: Response): Promise<Response> => {
  const p = period(req.query);
  const out = await retentionLog(scopeOf(req), { from: p.start, to: p.end, kind: String(req.query.kind || ""), search: String(req.query.search || ""), limit: 20000, offset: 0 });
  return sendCsv(res, `envios-retencao-${p.from}-a-${p.to}.csv`, ["Data", "Tipo", "Aluno", "WhatsApp", "Polo", "Tutor", "Enviado por", "Situação", "Resposta", "Mensagem"],
    out.rows.map(r => [
      csvDay(r.createdAt), KIND_NAME[r.kind] || r.kind, r.lead, csvAsText(String(r.phone || "")), r.polo || "", r.tutor || "", r.sentBy || "Automático",
      r.status === "sent" ? "Enviada" : "Falhou",
      r.kind === "nps" ? (r.surveyStatus === "answered" ? `Nota ${r.score}${r.comment ? `: ${r.comment}` : ""}` : r.surveyStatus ? "Sem resposta" : "") : "",
      r.body
    ]));
};

export const operations = async (req: Request, res: Response): Promise<Response> => {
  const p = period(req.query);
  return res.json({ from: p.from, to: p.to, ...(await retentionOperations(scopeOf(req), p.start, p.end)) });
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
    if (b.nps.buttons !== undefined) await setSetting("nps_buttons", b.nps.buttons ? "true" : "false");
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
