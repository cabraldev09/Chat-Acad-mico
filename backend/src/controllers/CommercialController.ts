import { Request, Response } from "express";
import { Op, QueryTypes } from "sequelize";
import Whatsapp from "../models/Whatsapp";

import { getSetting, setSetting } from "../helpers/AppSettings";
import { briefContext } from "../services/CommercialServices/Brief";
import { getSecretSetting } from "../helpers/SecretSettings";
import Polo from "../models/Polo";
import Queue from "../models/Queue";
import User from "../models/User";

import sequelize from "../database";
import AppError from "../errors/AppError";
import { dayBounds, shiftDays, getAppTz } from "../helpers/AppTime";
import AgentMetricEvent from "../models/AgentMetricEvent";
import AgentTurnLog from "../models/AgentTurnLog";
import AiAgent from "../models/AiAgent";
import AiUsage from "../models/AiUsage";
import Course from "../models/Course";
import CourseRegulation from "../models/CourseRegulation";
import Lead from "../models/Lead";
import LeadStage from "../models/LeadStage";
import Ticket from "../models/Ticket";
import TicketEvent from "../models/TicketEvent";
import { priceOf } from "../services/AiServices/Usage";
import { ensurePipeline, effectiveMap, saveMap, STAGE_KEYS, STAGE_SPECS, StageKey } from "../services/CommercialServices/Pipeline";
import { briefOf } from "../services/CommercialServices/Rules";
import { loadState } from "../services/CommercialServices/Slots";
import CommercialGrade from "../models/CommercialGrade";
import { chooseGrade } from "../services/CommercialServices/GradeChoice";

// ------------------------------------------------------------------ the funnel of the commercial agent

// Which column of the CRM each step of the journey uses. What already exists is recognised; what is missing can be created.
const funnelData = async () => {
  const map = await effectiveMap();
  const stages = await LeadStage.findAll({ order: [["position", "ASC"]], attributes: ["id", "name", "type", "color", "position"] });
  return {
    keys: STAGE_KEYS.map(k => ({ key: k, name: STAGE_SPECS[k].name, type: STAGE_SPECS[k].type, stageId: map[k] })),
    stages
  };
};

export const funnelShow = async (_req: Request, res: Response): Promise<Response> => res.json(await funnelData());

export const funnelSave = async (req: Request, res: Response): Promise<Response> => {
  const body = (req.body?.map || {}) as Record<string, any>;
  const stages = await LeadStage.findAll({ attributes: ["id", "type"] });
  const byId = new Map(stages.map(s => [s.id, s]));
  const clean: Partial<Record<StageKey, number | null>> = {};
  const used = new Set<number>();
  for (const k of STAGE_KEYS) {
    const id = Number(body[k]);
    if (!id) continue;
    const stage = byId.get(id);
    if (!stage) throw new AppError("ERR_NOT_FOUND", 404);
    // the "won" step takes a won column and the "lost" one a lost column: the agent never ends a lead in the wrong kind of column
    if (stage.type !== STAGE_SPECS[k].type) throw new AppError("ERR_FUNNEL_STAGE_TYPE", 400);
    if (used.has(id)) throw new AppError("ERR_FUNNEL_STAGE_REPEATED", 400);
    used.add(id);
    clean[k] = id;
  }
  await saveMap(clean);
  return res.json(await funnelData());
};

export const funnelCreate = async (_req: Request, res: Response): Promise<Response> => {
  const out = await ensurePipeline({ create: true });
  return res.json({ created: out.created, missing: out.missing, ...(await funnelData()) });
};

// ------------------------------------------------------------------ rules of the modality of each course (the MEC changes)

const flag = (v: any): boolean | null => (v === null || v === undefined || v === "" ? null : v === true || v === "true" || v === 1 || v === "1");
const pct = (v: any): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(",", "."));
  if (!Number.isFinite(n) || n < 0 || n > 100) throw new AppError("ERR_PERCENT_INVALID", 400);
  return Math.round(n * 100) / 100;
};
const text = (v: any, n: number): string | null => {
  const s = String(v ?? "").trim().slice(0, n);
  return s || null;
};

export const regulationsList = async (req: Request, res: Response): Promise<Response> => {
  const rows = await CourseRegulation.findAll({ order: [["courseId", "ASC"], ["intakeTerm", "ASC"]] });
  const courses = await Course.findAll({ attributes: ["id", "name", "modality", "level"], order: [["name", "ASC"]] });
  const onlyCourse = Number(req.query.courseId) || 0;
  return res.json({
    courses,
    rules: rows.filter(r => !onlyCourse || r.courseId === onlyCourse).map(r => ({ ...r.toJSON(), courseName: courses.find(c => c.id === r.courseId)?.name || "" }))
  });
};

export const regulationSave = async (req: Request, res: Response): Promise<Response> => {
  const b = req.body || {};
  const courseId = Number(req.params.courseId);
  if (!(await Course.findByPk(courseId))) throw new AppError("ERR_NOT_FOUND", 404);
  const intakeTerm = text(b.intakeTerm, 10);
  if (intakeTerm && !/^\d{4}\/[12]$/.test(intakeTerm)) throw new AppError("ERR_INTAKE_TERM_INVALID", 400);
  const values = {
    mecImpacted: flag(b.mecImpacted),
    regulation: text(b.regulation, 300),
    percentualPresencial: pct(b.percentualPresencial),
    percentualSincrono: pct(b.percentualSincrono),
    teoriaAoVivo: flag(b.teoriaAoVivo),
    praticaPresencial: flag(b.praticaPresencial),
    cronogramaPraticasDefinido: flag(b.cronogramaPraticasDefinido),
    transitionStatus: text(b.transitionStatus, 40),
    currentDelivery: text(b.currentDelivery, 40),
    futureDelivery: text(b.futureDelivery, 40),
    transitionNote: text(b.transitionNote, 2000),
    commercialApprovedText: text(b.commercialApprovedText, 2000)
  };
  const existing = await CourseRegulation.findOne({ where: { courseId, intakeTerm: intakeTerm as any } });
  const row = existing ? await existing.update(values as any) : await CourseRegulation.create({ courseId, intakeTerm, ...values } as any);
  return res.json(row);
};

// the standard by area (Portaria MEC 378/2025): what each area says, the courses in it, and applying it to them
export const mecDefaultsShow = async (_req: Request, res: Response): Promise<Response> => {
  const { getAreas, classifyCourses } = await import("../services/CommercialServices/MecDefaults");
  const [areas, courses] = await Promise.all([getAreas(), classifyCourses()]);
  return res.json({
    areas: areas.map(a => ({ ...a, courses: courses.filter(c => c.area === a.id).map(c => ({ id: c.id, name: c.name, hasRule: c.hasRule })) })),
    withoutRule: courses.filter(c => !c.hasRule).length,
    total: courses.length
  });
};

export const mecDefaultsSave = async (req: Request, res: Response): Promise<Response> => {
  const { saveArea } = await import("../services/CommercialServices/MecDefaults");
  try {
    return res.json(await saveArea(String(req.params.area), req.body || {}));
  } catch (err) {
    throw new AppError(String((err as Error).message) === "percent" ? "ERR_PERCENT_INVALID" : "ERR_NOT_FOUND", String((err as Error).message) === "percent" ? 400 : 404);
  }
};

// apply the standard: only to the courses without a rule, or (overwrite) to every course of the area/all areas
export const mecDefaultsApply = async (req: Request, res: Response): Promise<Response> => {
  const { applyDefaults, syncMecKnowledge } = await import("../services/CommercialServices/MecDefaults");
  const out = await applyDefaults({ area: req.body?.area ? String(req.body.area) : undefined, overwrite: req.body?.overwrite === true });
  const docs = await syncMecKnowledge();
  return res.json({ ...out, agentsUpdated: docs });
};

export const regulationRemove = async (req: Request, res: Response): Promise<Response> => {
  const row = await CourseRegulation.findByPk(req.params.id);
  if (!row) throw new AppError("ERR_NOT_FOUND", 404);
  await row.destroy();
  return res.json({ ok: true });
};

// ------------------------------------------------------------------ what the agent knows about a lead

const handoffOf = async (leadId: number): Promise<{ note: string; at: Date; ticketId: number } | null> => {
  const lead = await Lead.findByPk(leadId, { attributes: ["id", "contactId"] });
  if (!lead || !lead.contactId) return null;
  const tickets = await Ticket.findAll({ where: { contactId: lead.contactId }, attributes: ["id"] });
  if (!tickets.length) return null;
  // the brief of the agent (the other "handoff" events of the conversation are transfers)
  const ev = await TicketEvent.findOne({
    where: { ticketId: tickets.map(t => t.id), type: "handoff", [Op.or]: [{ note: { [Op.like]: "LEAD PRONTO PARA PROPOSTA%" } }, { note: { [Op.like]: "RESUMO DO ATENDIMENTO COM IA%" } }] } as any,
    order: [["id", "DESC"]]
  });
  return ev ? { note: String(ev.getDataValue("note") || ""), at: ev.createdAt, ticketId: ev.ticketId } : null;
};

const commercialOf = async (leadId: number) => {
  const lead = await Lead.findByPk(leadId, { attributes: ["id", "stageId"] });
  if (!lead) throw new AppError("ERR_NOT_FOUND", 404);
  const row = await (await import("../models/LeadCommercial")).default.findOne({ where: { leadId } });
  if (!row) return { exists: false };
  const state = await loadState(leadId);
  const stageName = (await LeadStage.findByPk(lead.stageId))?.name || null;
  const events = await AgentMetricEvent.findAll({ where: { leadId, once: true }, order: [["createdAt", "ASC"]], attributes: ["event", "createdAt"] });
  const turns = await AgentTurnLog.findAll({ where: { leadId }, order: [["id", "DESC"]], limit: 10 });
  const handoff = await handoffOf(leadId);
  const { slots } = state;
  return {
    exists: true,
    temperature: state.temperature,
    commercialScore: state.commercialScore,
    readyForProposal: state.readyForProposal,
    nextAction: state.nextAction,
    lastIntent: state.lastIntent,
    followUpReason: state.followUpReason,
    followUpAt: state.followUpAt,
    summary: state.summary,
    entryType: slots.entryType || "unknown",
    analysisStatus: slots.analysisStatus || "not_applicable",
    slots,
    brief: briefOf(state, { stageName, ...(await briefContext(null, lead)) }),
    handoff,
    events: events.map(e => ({ event: e.event, at: e.createdAt })),
    turns: turns.map(t => ({ id: t.id, intent: t.intent, deterministic: t.deterministic, llmCalls: t.llmCalls, toolCalls: t.toolCalls, tokens: t.inputTokens + t.outputTokens, outcome: t.outcome, at: t.createdAt }))
  };
};

export const leadCommercial = async (req: Request, res: Response): Promise<Response> => res.json(await commercialOf(Number(req.params.id)));

// the panel of the conversation: the lead of this contact
export const ticketCommercial = async (req: Request, res: Response): Promise<Response> => {
  const ticket = await Ticket.findByPk(req.params.ticketId, { attributes: ["id", "contactId"] });
  if (!ticket) throw new AppError("ERR_NOT_FOUND", 404);
  const lead = await Lead.findOne({ where: { contactId: ticket.contactId }, attributes: ["id"] });
  if (!lead) return res.json({ exists: false });
  return res.json({ leadId: lead.id, ...(await commercialOf(lead.id)) });
};

// ------------------------------------------------------------------ metrics of the agent

export const FUNNEL_EVENTS: Array<{ event: string; label: string }> = [
  { event: "lead_received", label: "Leads recebidos" },
  { event: "contact_started", label: "Contato iniciado" },
  { event: "replied", label: "Responderam" },
  { event: "qualified", label: "Qualificados" },
  { event: "transfer", label: "Transferência" },
  { event: "second_degree", label: "Segunda graduação" },
  { event: "analysis_requested", label: "Análise curricular pedida" },
  { event: "analysis_completed", label: "Análise curricular concluída" },
  { event: "ready_for_proposal", label: "Prontos para proposta" },
  { event: "handoff_brief", label: "Entregues ao consultor com resumo" },
  { event: "proposal_sent", label: "Proposta enviada" },
  { event: "enrollment_started", label: "Matrícula em andamento" },
  { event: "enrolled", label: "Matriculados" },
  { event: "follow_up", label: "Follow-up" },
  { event: "no_response", label: "Pararam de responder" },
  { event: "no_interest", label: "Sem interesse" },
  { event: "human_handoff", label: "Pediram uma pessoa" }
];

const range = (req: Request): { from: Date; to: Date; days: number } => {
  const days = Math.min(120, Math.max(1, Number(req.query.days) || 30));
  const to = dayBounds().end;
  return { from: shiftDays(dayBounds().start, -(days - 1)), to, days };
};

export const metrics = async (req: Request, res: Response): Promise<Response> => {
  const agent = await AiAgent.findByPk(req.params.id);
  if (!agent) throw new AppError("ERR_NOT_FOUND", 404);
  const { from, to, days } = range(req);
  const rep = { agentId: agent.id, from, to };

  // the funnel: each milestone counts once per lead
  const rows: any[] = await sequelize.query(
    `SELECT "event", COUNT(DISTINCT "leadId") AS leads, COUNT(*) AS total FROM "AgentMetricEvents"
      WHERE "agentId" = :agentId AND "createdAt" >= :from AND "createdAt" < :to GROUP BY "event"`,
    { replacements: rep, type: QueryTypes.SELECT }
  );
  const count = (event: string) => Number(rows.find(r => r.event === event)?.leads || 0);
  const funnel = FUNNEL_EVENTS.map(e => ({ ...e, leads: count(e.event) }));
  const first = funnel[0].leads;
  const unknown = Number(rows.find(r => r.event === "unknown")?.total || 0);
  const deterministicReplies = Number(rows.find(r => r.event === "deterministic_reply")?.total || 0);

  // the turns: how much the AI was used and what it cost
  const t: any = (await sequelize.query(
    `SELECT COUNT(*) AS turns, COALESCE(SUM("llmCalls"),0) AS llm, COALESCE(SUM("toolCalls"),0) AS tools, COALESCE(SUM("cacheHits"),0) AS cache,
            COALESCE(SUM("inputTokens"),0) AS input, COALESCE(SUM("outputTokens"),0) AS output, COALESCE(SUM("cacheReadTokens"),0) AS "cacheRead",
            COALESCE(SUM(CASE WHEN "deterministic" THEN 1 ELSE 0 END),0) AS deterministic, COALESCE(AVG(NULLIF("latencyMs",0)),0) AS latency,
            COUNT(DISTINCT "ticketId") AS conversations
       FROM "AgentTurnLogs" WHERE "agentId" = :agentId AND "createdAt" >= :from AND "createdAt" < :to`,
    { replacements: rep, type: QueryTypes.SELECT }
  ))[0] || {};
  const turns = Number(t.turns || 0);
  const input = Number(t.input || 0);
  const output = Number(t.output || 0);
  const conversations = Number(t.conversations || 0);

  // tokens per lead that reached a milestone (the cost of getting somewhere)
  const perLead = async (event: string): Promise<{ leads: number; tokens: number | null }> => {
    const r: any = (await sequelize.query(
      `SELECT COUNT(DISTINCT m."leadId") AS leads, COALESCE(SUM(l."inputTokens" + l."outputTokens"),0) AS tokens
         FROM "AgentMetricEvents" m JOIN "AgentTurnLogs" l ON l."leadId" = m."leadId" AND l."agentId" = m."agentId"
        WHERE m."agentId" = :agentId AND m."event" = :event AND m."createdAt" >= :from AND m."createdAt" < :to`,
      { replacements: { ...rep, event }, type: QueryTypes.SELECT }
    ))[0] || {};
    const leads = Number(r.leads || 0);
    return { leads, tokens: leads ? Math.round(Number(r.tokens || 0) / leads) : null };
  };

  // by step of the flow
  const byNode: any[] = await sequelize.query(
    `SELECT "nodeId", COUNT(*) AS turns, COALESCE(SUM("inputTokens"+"outputTokens"),0) AS tokens, COALESCE(SUM("llmCalls"),0) AS llm
       FROM "AgentTurnLogs" WHERE "agentId" = :agentId AND "createdAt" >= :from AND "createdAt" < :to AND "nodeId" IS NOT NULL GROUP BY "nodeId" ORDER BY tokens DESC LIMIT 12`,
    { replacements: rep, type: QueryTypes.SELECT }
  );
  const perDay: any[] = await sequelize.query(
    `SELECT TO_CHAR("createdAt" AT TIME ZONE :tz, 'YYYY-MM-DD') AS day, COUNT(*) AS turns, COALESCE(SUM("inputTokens"+"outputTokens"),0) AS tokens
       FROM "AgentTurnLogs" WHERE "agentId" = :agentId AND "createdAt" >= :from AND "createdAt" < :to GROUP BY 1 ORDER BY 1`,
    { replacements: { ...rep, tz: getAppTz() }, type: QueryTypes.SELECT }
  ).catch(() => []);
  const latencyUsage = await AiUsage.count({ where: { agentId: agent.id, kind: { [Op.ne]: "test" }, createdAt: { [Op.gte]: from } } as any });

  // the cost only when the administrator typed the price of the model (prices are never guessed)
  const price = await priceOf(agent.model);
  const costUsd = price ? Math.round(((input * price.in + output * price.out) / 1e6) * 10000) / 10000 : null;
  // the handoffs to people: by reason, by polo, how long until a person answered and how many nobody answered
  const reasons: any[] = await sequelize.query(
    `SELECT REPLACE("event", 'handoff_', '') AS why, COUNT(*) AS n FROM "AgentMetricEvents"
      WHERE "agentId" = :agentId AND "event" LIKE 'handoff\\_%' AND "event" <> 'handoff_brief' AND "createdAt" >= :from AND "createdAt" < :to GROUP BY 1 ORDER BY n DESC`,
    { replacements: rep, type: QueryTypes.SELECT }
  );
  const byPolo: any[] = await sequelize.query(
    `SELECT COALESCE(p."name", 'Sem polo') AS polo, COUNT(*) AS n FROM "AgentMetricEvents" m
       LEFT JOIN "Polos" p ON p."id" = NULLIF((m."meta"::json->>'polo'), 'null')::int
      WHERE m."agentId" = :agentId AND m."event" LIKE 'handoff\\_%' AND m."event" <> 'handoff_brief' AND m."createdAt" >= :from AND m."createdAt" < :to GROUP BY 1 ORDER BY n DESC LIMIT 12`,
    { replacements: rep, type: QueryTypes.SELECT }
  ).catch(() => []);
  // only the conversations THIS agent handed over (the handoff events of the agent name the lead)
  const waits: any[] = await sequelize.query(
    `SELECT t."id", t."handoffAt", (SELECT MIN(msg."createdAt") FROM "Messages" msg WHERE msg."ticketId" = t."id" AND msg."fromMe" = true AND msg."createdAt" > t."handoffAt" AND msg."body" NOT LIKE E'\u200e%') AS answered
       FROM "Tickets" t JOIN "Leads" l ON l."contactId" = t."contactId"
      WHERE t."handoffAt" >= :from AND t."handoffAt" < :to AND t."aiActive" = false
        AND l."id" IN (SELECT DISTINCT "leadId" FROM "AgentMetricEvents" WHERE "agentId" = :agentId AND "event" LIKE 'handoff\\_%' AND "event" <> 'handoff_brief' AND "createdAt" >= :from AND "createdAt" < :to)
      LIMIT 500`,
    { replacements: rep, type: QueryTypes.SELECT }
  ).catch(() => []);
  const answeredWaits = waits.filter(w => w.answered).map(w => (new Date(w.answered).getTime() - new Date(w.handoffAt).getTime()) / 60000).sort((a, b) => a - b);
  const technical = {
    errors: Number(rows.find(r => r.event === "agent_error")?.total || 0),
    guards: Number(rows.find(r => r.event === "agent_guard")?.total || 0)
  };
  const qualified = await perLead("qualified");
  const ready = await perLead("ready_for_proposal");

  // the funnel of the agent cut by the polo and by where the lead came from (the lead's own data, each lead once per step)
  const cut = async (column: string, empty: string) => {
    const r: any[] = await sequelize.query(
      `SELECT COALESCE(${column}, :empty) AS label, e."event", COUNT(DISTINCT e."leadId") AS n
         FROM "AgentMetricEvents" e JOIN "Leads" l ON l."id" = e."leadId" LEFT JOIN "Polos" p ON p."id" = l."poloId"
        WHERE e."agentId" = :agentId AND e."createdAt" >= :from AND e."createdAt" < :to AND e."event" IN ('lead_received','qualified','ready_for_proposal','enrolled','no_interest')
        GROUP BY 1, 2`,
      { replacements: { ...rep, empty }, type: QueryTypes.SELECT }
    ).catch(() => []);
    const labels = [...new Set(r.map(x => x.label))];
    return labels
      .map(label => {
        const n = (e: string) => Number(r.find(x => x.label === label && x.event === e)?.n || 0);
        const received = n("lead_received");
        return { label, received, qualified: n("qualified"), ready: n("ready_for_proposal"), enrolled: n("enrolled"), lost: n("no_interest"), qualifiedRate: received ? Math.round((n("qualified") / received) * 1000) / 10 : null };
      })
      .sort((a, b) => b.received - a.received)
      .slice(0, 12);
  };
  const byPoloFunnel = await cut('p."name"', "Sem polo");
  const bySourceFunnel = await cut('l."source"', "Sem origem");
  // all the leads that entered in the period against the ones this agent attended (the real base of the conversion)
  const intake: any = (await sequelize.query(
    `SELECT COUNT(*) AS n FROM "AgentMetricEvents" WHERE "event" = 'lead_created' AND "createdAt" >= :from AND "createdAt" < :to`,
    { replacements: rep, type: QueryTypes.SELECT }
  ).catch(() => []))[0] || {};
  const lostReasons: any[] = await sequelize.query(
    `SELECT COALESCE(l."lostReason", 'Sem motivo') AS reason, COUNT(*) AS n FROM "Leads" l
      WHERE l."id" IN (SELECT DISTINCT "leadId" FROM "AgentMetricEvents" WHERE "agentId" = :agentId AND "event" = 'no_interest' AND "createdAt" >= :from AND "createdAt" < :to)
      GROUP BY 1 ORDER BY n DESC`,
    { replacements: rep, type: QueryTypes.SELECT }
  ).catch(() => []);

  return res.json({
    days,
    funnel,
    conversion: first ? funnel.slice(1).filter(f => ["qualified", "ready_for_proposal", "enrolled"].includes(f.event)).map(f => ({ event: f.event, label: f.label, rate: Math.round((f.leads / first) * 1000) / 10 })) : [],
    unknownQuestions: unknown,
    intake: { created: Number(intake.n || 0), attended: first },
    byPoloFunnel,
    bySourceFunnel,
    lostReasons: lostReasons.map(r => ({ reason: r.reason, count: Number(r.n) })),
    handoffs: {
      total: reasons.reduce((a, r) => a + Number(r.n), 0),
      byReason: reasons.map(r => ({ why: r.why, count: Number(r.n) })),
      byPolo: byPolo.map(r => ({ polo: r.polo, count: Number(r.n) })),
      answered: answeredWaits.length,
      unanswered: waits.length - answeredWaits.length,
      medianMinutes: answeredWaits.length ? Math.round(answeredWaits[Math.floor(answeredWaits.length / 2)]) : null
    },
    technical,
    ai: {
      turns,
      conversations,
      llmCalls: Number(t.llm || 0),
      toolCalls: Number(t.tools || 0),
      cacheHits: Number(t.cache || 0),
      deterministicTurns: Number(t.deterministic || 0),
      deterministicReplies,
      deterministicShare: turns ? Math.round((Number(t.deterministic || 0) / turns) * 1000) / 10 : 0,
      tokens: { input, output, cacheRead: Number(t.cacheRead || 0), total: input + output },
      avgLatencyMs: Math.round(Number(t.latency || 0)),
      perConversation: conversations ? Math.round((input + output) / conversations) : null,
      perTurn: turns ? Math.round((input + output) / turns) : null,
      perQualifiedLead: qualified.tokens,
      perReadyLead: ready.tokens,
      costUsd,
      costPerConversationUsd: costUsd !== null && conversations ? Math.round((costUsd / conversations) * 10000) / 10000 : null,
      priceSet: !!price,
      model: agent.model,
      calls: latencyUsage
    },
    byNode: byNode.map(n => ({ nodeId: n.nodeId, turns: Number(n.turns), tokens: Number(n.tokens), llmCalls: Number(n.llm) })),
    perDay: perDay.map(d => ({ day: d.day, turns: Number(d.turns), tokens: Number(d.tokens) }))
  });
};

// ------------------------------------------------------------------ who takes the conversation (the handoff to people)

const KEYS = { fallback: "crm_fallback_queue", sla: "crm_handoff_sla_minutes", stale: "ai_stale_run_days", transcribe: "ai_transcribe_audio" };

// the settings of the handoff and, polo by polo, whether somebody would really answer ("ready to attend")
const handoffData = async () => {
  const queues = await Queue.findAll({ include: [{ model: User, as: "users", attributes: ["id", "name"], required: false }, { model: Polo, as: "polo", attributes: ["id", "name"], required: false }], order: [["name", "ASC"]] });
  const polos = await Polo.findAll({ where: { active: true }, order: [["name", "ASC"]], attributes: ["id", "name", "city"] });
  const commercial = queues.filter(q => q.role === "comercial");
  const fallbackId = Number(await getSetting(KEYS.fallback, "0")) || 0;
  const reserve = (fallbackId && queues.find(q => q.id === fallbackId)) || commercial.find(q => ((q as any).users || []).length);
  const rows = polos.map(p => {
    const q = commercial.find(x => x.poloId === p.id);
    const people = q ? ((q as any).users || []).length : 0;
    return {
      id: p.id,
      name: p.name,
      city: p.city,
      queue: q ? { id: q.id, name: q.name, people } : null,
      ready: people > 0,
      issue: !q ? "Este polo não tem fila comercial." : people === 0 ? "A fila comercial deste polo não tem consultores: as conversas ficam na fila do polo e só a gestão é avisada." : null
    };
  });
  return {
    settings: {
      fallbackQueueId: fallbackId || null,
      slaMinutes: Number(await getSetting(KEYS.sla, "15")),
      staleDays: Number(await getSetting(KEYS.stale, "7")),
      transcribe: (await getSetting(KEYS.transcribe, "1")) !== "0"
    },
    openaiKey: !!(await getSecretSetting("ai_openai_key")),
    reserve: reserve ? { id: reserve.id, name: reserve.name, people: ((reserve as any).users || []).length } : null,
    queues: commercial.map(q => ({ id: q.id, name: q.name, polo: (q as any).polo ? (q as any).polo.name : null, people: ((q as any).users || []).length })),
    polos: rows
  };
};

export const handoffShow = async (_req: Request, res: Response): Promise<Response> => res.json(await handoffData());

export const handoffSave = async (req: Request, res: Response): Promise<Response> => {
  const b = req.body || {};
  if (b.fallbackQueueId !== undefined) {
    const id = Number(b.fallbackQueueId) || 0;
    if (id && !(await Queue.findByPk(id))) throw new AppError("ERR_NO_QUEUE_FOUND", 404);
    await setSetting(KEYS.fallback, String(id));
  }
  const num = (v: any, min: number, max: number): string => String(Math.min(max, Math.max(min, Math.round(Number(v) || 0))));
  if (b.slaMinutes !== undefined) await setSetting(KEYS.sla, num(b.slaMinutes, 0, 480));
  if (b.staleDays !== undefined) await setSetting(KEYS.stale, num(b.staleDays, 0, 90));
  if (b.transcribe !== undefined) await setSetting(KEYS.transcribe, b.transcribe ? "1" : "0");
  return handoffShow(req, res);
};

// ------------------------------------------------------------------ "Melhorar o agente": what the base of knowledge still lacks

const TOPIC_LIST: Array<{ topic: string; label: string; hint: string; for: Array<"commercial" | "service"> }> = [
  { topic: "institutional/platform", label: "Plataforma de estudo", hint: "Como o aluno acessa, o que encontra, em quais aparelhos funciona.", for: ["commercial"] },
  { topic: "institutional/tutoring", label: "Tutoria", hint: "O que a tutoria faz e quando o aluno fala com ela.", for: ["commercial", "service"] },
  { topic: "institutional/faculty", label: "Corpo docente", hint: "Titulação e perfil dos professores (só o que a instituição confirma).", for: ["commercial"] },
  { topic: "institutional/enrollment", label: "Matrícula e documentos", hint: "Documentos necessários e como a matrícula acontece; o que a secretaria resolve.", for: ["commercial", "service"] },
  { topic: "institutional/mec", label: "Mudanças do MEC", hint: "Explicação aprovada sobre as novas regras de modalidade.", for: ["commercial"] },
  { topic: "institutional/internship", label: "Estágio remunerado", hint: "Como funciona a busca e a formalização.", for: ["commercial"] },
  { topic: "institutional/recognition", label: "Reconhecimento do curso", hint: "Texto oficial sobre autorização e reconhecimento.", for: ["commercial"] },
  { topic: "institutional/analysis", label: "Análise curricular", hint: "Como o aproveitamento de disciplinas é analisado.", for: ["commercial"] }
];

// the kind of an agent comes from its drawing: some block of the flow has the commercial hook (never from the formatting of the JSON)
const kindOfDraft = (draft: any): "commercial" | "service" => {
  try {
    const g = typeof draft === "string" ? JSON.parse(draft) : draft;
    const nodes: any[] = Array.isArray(g?.nodes) ? g.nodes : [];
    return nodes.some(n => Array.isArray(n?.data?.hooks) && n.data.hooks.includes("commercial")) ? "commercial" : "service";
  } catch (_) {
    return /"hooks":\s*\[\s*"commercial"/.test(String(draft || "")) ? "commercial" : "service";
  }
};
export { kindOfDraft };

// the board of one agent: pending questions of the team, subjects without text, and what to do next
const improveData = async (agent: AiAgent) => {
  const AiLearning = (await import("../models/AiLearning")).default;
  const KbDocument = (await import("../models/KbDocument")).default;
  const flow = await (await import("../models/ChatFlow")).default.findOne({ where: { kind: "agent", agentId: agent.id }, attributes: ["id", "draft"] });
  const kind = kindOfDraft(flow ? flow.draft : "");

  const docs = await KbDocument.findAll({ where: { agentId: { [Op.or]: [agent.id, null] } } as any, attributes: ["id", "title", "topic", "kind", "source", "updatedAt", "agentId"] });
  const rows = await AiLearning.findAll({ where: { agentId: agent.id, status: { [Op.in]: ["aguardando_equipe", "para_revisar"] } }, order: [["id", "DESC"]], limit: 300 });
  const norm = (s: string) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  const grouped = new Map<string, { question: string; count: number; status: string; ids: number[] }>();
  rows.forEach(r => {
    const k = norm(r.question).slice(0, 80);
    const g = grouped.get(k) || { question: r.question, count: 0, status: r.status, ids: [] };
    g.count += 1;
    g.ids.push(r.id);
    if (r.status === "para_revisar") g.status = "para_revisar";
    grouped.set(k, g);
  });
  const questions = [...grouped.values()].sort((a, b) => b.count - a.count).slice(0, 12);

  const topics = TOPIC_LIST.filter(t => t.for.includes(kind)).map(t => {
    const own = docs.filter(d => d.topic === t.topic || String(d.topic || "").startsWith(`${t.topic}/`));
    return { topic: t.topic, label: t.label, hint: t.hint, documents: own.length, ok: own.length > 0 };
  });
  const since = new Date(Date.now() - 30 * 86400000);
  const events: any[] = await sequelize.query(
    `SELECT "event", COUNT(*) AS n FROM "AgentMetricEvents" WHERE "agentId" = :id AND "createdAt" >= :since AND "event" IN ('unknown','agent_guard','agent_error') GROUP BY 1`,
    { replacements: { id: agent.id, since }, type: QueryTypes.SELECT }
  ).catch(() => []);
  const count = (e: string) => Number(events.find(x => x.event === e)?.n || 0);
  const activeIds = (await Course.findAll({ where: { active: true } as any, attributes: ["id"] })).map(c => c.id);
  const courses = activeIds.length;
  // only courses that are active count (a rule of a course that was removed from the catalogue is not a course with a rule)
  const withRule = kind === "commercial" && courses ? await CourseRegulation.count({ distinct: true, col: "courseId", where: { courseId: { [Op.in]: activeIds } } as any }) : 0;
  const waiting = rows.filter(r => r.status === "aguardando_equipe");
  const waitingGroups = new Set(waiting.map(r => norm(r.question).slice(0, 80))).size;

  const next: string[] = [];
  if (waiting.length) next.push(`Responda ${waitingGroups === 1 ? "a pergunta" : `as ${waitingGroups} perguntas`} que o agente não soube responder: a resposta vira conhecimento dele.`);
  if (rows.some(r => r.status === "para_revisar")) next.push("Revise e aprove as respostas que a equipe já deu: o agente aprende com elas.");
  topics.filter(t => !t.ok).slice(0, 3).forEach(t => next.push(`Envie um texto ou PDF sobre “${t.label}”: hoje o agente diz que vai confirmar.`));
  if (kind === "commercial" && courses && withRule < courses) next.push(`Cadastre as regras do MEC dos cursos (${withRule} de ${courses} têm regra).`);
  if (count("agent_guard")) next.push(`${count("agent_guard")} resposta(s) foram barradas por trazerem valor, promessa ou dado sem fonte: coloque o dado certo na base.`);

  return {
    agent: { id: agent.id, name: agent.name, kind, active: !!agent.active, provider: agent.provider, model: agent.model },
    flow: flow ? { id: flow.id } : null,
    documents: { total: docs.length, own: docs.filter(d => d.agentId === agent.id).length, shared: docs.filter(d => !d.agentId).length, faq: docs.filter(d => d.kind === "faq").length, files: docs.filter(d => d.source === "arquivo").length, lastAt: docs.reduce((m, d) => (d.updatedAt > m ? d.updatedAt : m), new Date(0)) },
    pending: { waiting: waitingGroups, toReview: rows.filter(r => r.status === "para_revisar").length },
    questions,
    questionsTotal: grouped.size,
    topics,
    last30days: { unknown: count("unknown"), blocked: count("agent_guard"), errors: count("agent_error") },
    regulations: kind === "commercial" ? { courses, withRule } : null,
    next
  };
};

export const improve = async (req: Request, res: Response): Promise<Response> => {
  const agent = await AiAgent.findByPk(req.params.id);
  if (!agent) throw new AppError("ERR_NOT_FOUND", 404);
  return res.json(await improveData(agent));
};

// THE CENTRAL OF THE AGENT: one call for its first screen. What to do now, the health of the agent (each check names where to fix it), the last
// seven days in four numbers, and the questions it could not answer.
export const central = async (req: Request, res: Response): Promise<Response> => {
  const agent = await AiAgent.findByPk(req.params.id);
  if (!agent) throw new AppError("ERR_NOT_FOUND", 404);
  const data = await improveData(agent);
  const ChatFlow = (await import("../models/ChatFlow")).default;
  const flow = await ChatFlow.findOne({ where: { kind: "agent", agentId: agent.id }, attributes: ["id", "status", "version"] });
  const since7 = new Date(Date.now() - 7 * 86400000);
  const events: any[] = await sequelize.query(
    `SELECT "event", COUNT(DISTINCT "leadId") AS n FROM "AgentMetricEvents" WHERE "agentId" = :id AND "createdAt" >= :since AND "event" IN ('lead_received','qualified','ready_for_proposal','unknown') GROUP BY 1`,
    { replacements: { id: agent.id, since: since7 }, type: QueryTypes.SELECT }
  ).catch(() => []);
  const handoffs: any[] = await sequelize.query(
    `SELECT COUNT(*) AS n FROM "AgentMetricEvents" WHERE "agentId" = :id AND "createdAt" >= :since AND "event" LIKE 'handoff\\_%' AND "event" <> 'handoff_brief'`,
    { replacements: { id: agent.id, since: since7 }, type: QueryTypes.SELECT }
  ).catch(() => []);
  const n7 = (e: string) => Number(events.find(x => x.event === e)?.n || 0);
  const received = n7("lead_received");
  const week = { conversations: received, qualified: n7("qualified"), qualifiedRate: received ? Math.round((n7("qualified") / received) * 100) : null, readyForProposal: n7("ready_for_proposal"), handedOver: Number(handoffs[0]?.n || 0), unanswered: n7("unknown") };

  const hasKey = !!(agent.apiKey || (await getSecretSetting(agent.provider === "openai" ? "ai_openai_key" : "ai_anthropic_key")));
  const handoff = await handoffData();
  const { default: PoloCoverage } = await import("../models/PoloCoverage");
  const polos = await Polo.findAll({ where: { active: true }, attributes: ["id", "name"] });
  const covered = new Set((await PoloCoverage.findAll({ attributes: ["poloId"] })).map(c => c.poloId));
  // a polo is found by the city written on it too (two polos in the same city share it): it only lacks cities when it has neither
  const noCities = polos.filter(p => !covered.has(p.id) && !String(p.city || "").trim());
  const notReady = handoff.polos.filter(p => !p.ready);
  const commercial = data.agent.kind === "commercial";
  const funnel = commercial ? await funnelData() : null;
  const missingStages = funnel ? funnel.keys.filter(k => !k.stageId).length : 0;
  const published = !flow || flow.status === "published";
  // a personal number sends every new conversation straight to its owner: the agent only answers there when the number is also an attendance number
  const served = await Whatsapp.findAll({ where: { ...(agent.whatsappId ? { id: agent.whatsappId } : {}), ownerId: { [Op.ne]: null } } as any, attributes: ["id", "name", "ownerId", "aiFirst"] });
  const personal = served.filter(w => !w.aiFirst);

  // the courses of the catalogue and the grade each one has: the agent sends the grade of the course of every lead, so one without it is a gap
  const catalogue = await Course.findAll({ where: { active: true } as any, attributes: ["id", "name", "modality"], order: [["name", "ASC"]] });
  const grades = await CommercialGrade.findAll({ attributes: ["id", "courseName", "modality", "curriculumTerm"] });
  const withoutGrade = catalogue.filter(c => !chooseGrade(grades as any[], c, null).grade).map(c => c.name);

  type Check = { key: string; label: string; ok: boolean; detail: string; fix: string };
  const health: Check[] = [
    { key: "active", label: "Agente ligado", ok: !!agent.active, detail: agent.active ? "Atendendo as conversas." : "Desligado: ninguém é atendido por ele.", fix: "ligar" },
    { key: "key", label: "Chave de IA", ok: hasKey, detail: hasKey ? "Conectada." : "Sem chave de IA: o agente não consegue responder.", fix: "ajustes:chave" },
    { key: "flow", label: "Roteiro da conversa", ok: published, detail: !flow ? "Modo simples (sem desenho em blocos)." : published ? `Publicado (versão ${flow.version}).` : "Ainda é rascunho: publique para valer.", fix: "roteiro" },
    ...(commercial
      ? [
          { key: "polos", label: "Consultor em cada polo", ok: notReady.length === 0, detail: notReady.length ? `${notReady.length} polo(s) sem consultor: ${notReady.map(p => p.name).join(", ")}.` : "Todos os polos têm quem atenda.", fix: "ajustes:assume" },
          { key: "cities", label: "Cidades de cada polo", ok: noCities.length === 0, detail: noCities.length ? `${noCities.length} polo(s) sem cidades cadastradas: o agente só acha o polo pela cidade do próprio polo.` : "Todos os polos têm cidades cadastradas.", fix: "polos" },
          { key: "grades", label: "Grade de cada curso oferecido", ok: withoutGrade.length === 0, detail: withoutGrade.length ? `${withoutGrade.length} de ${catalogue.length} curso(s) sem grade (o agente não consegue enviar): ${withoutGrade.slice(0, 6).join(", ")}${withoutGrade.length > 6 ? "…" : ""}.` : `Os ${catalogue.length} cursos oferecidos têm grade.`, fix: "grades" },
          { key: "crm", label: "Etapas do funil no CRM", ok: missingStages === 0, detail: missingStages ? `${missingStages} etapa(s) do agente sem coluna no CRM.` : "Todas as etapas têm coluna.", fix: "ajustes:funil" },
          { key: "mec", label: "Regras do MEC dos cursos", ok: !data.regulations || data.regulations.withRule >= data.regulations.courses, detail: data.regulations ? `${data.regulations.withRule} de ${data.regulations.courses} cursos com regra.` : "", fix: "ajustes:mec" }
        ]
      : []),
    ...(personal.length
      ? [{ key: "personal", label: "Número pessoal", ok: false, detail: `${personal.map(w => `"${w.name}"`).join(", ")}: número pessoal, as conversas novas vão direto para o dono e o agente não responde. Em Conexões, ligue "Agente de IA atende primeiro" no número de atendimento.`, fix: "conexoes" }]
      : []),
    { key: "errors", label: "Falhas da IA (30 dias)", ok: data.last30days.errors === 0, detail: data.last30days.errors ? `${data.last30days.errors} falha(s): a conversa foi para a equipe. Veja a chave e o saldo do provedor.` : "Nenhuma falha.", fix: "ajustes:chave" }
  ];

  return res.json({ ...data, flow: flow ? { id: flow.id, status: flow.status, version: flow.version } : null, week, health, courses: { total: catalogue.length, names: catalogue.map(c => c.name), withoutGrade } });
};
