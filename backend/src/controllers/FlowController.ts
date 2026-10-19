import { Request, Response } from "express";

import AppError from "../errors/AppError";
import ChatFlow from "../models/ChatFlow";
import ChatFlowRun from "../models/ChatFlowRun";
import ChatFlowStat from "../models/ChatFlowStat";
import ChatFlowVersion from "../models/ChatFlowVersion";
import AiAgent from "../models/AiAgent";
import User from "../models/User";
import AutomationTrigger from "../models/AutomationTrigger";
import { advance, firstNode, resume, RunState } from "../services/FlowServices/Engine";
import { simEffects } from "../services/FlowServices/Effects";
import { generateFlow } from "../services/FlowServices/Generate";
import { Graph, parseGraph, validateGraph } from "../services/FlowServices/Graph";
import { flowStats, hasActiveAiAgent, parseEntry } from "../services/FlowServices/Runner";
import { TEMPLATES, autoLayout, blankGraph, legacyToGraph } from "../services/FlowServices/Templates";

const uid = (req: Request): number => Number(req.user.id);
const clip = (v: any, n: number): string => String(v || "").trim().slice(0, n);

const load = async (id: any): Promise<ChatFlow> => {
  const flow = await ChatFlow.findByPk(Number(id));
  if (!flow) throw new AppError("ERR_NOT_FOUND", 404);
  return flow;
};

const entryOf = (raw: any) => {
  const e = parseEntry(raw);
  return JSON.stringify({ type: e.type, keywords: e.type === "keyword" ? (e.keywords || []).map(k => clip(k, 40)).filter(Boolean).slice(0, 20) : [] });
};

// graphs are stored as text; keep only what the engine knows and a sane size
const cleanGraph = (raw: any): Graph => {
  const g = parseGraph(raw);
  return { nodes: g.nodes.slice(0, 120), edges: g.edges.slice(0, 400) };
};

// the agent an AI stage talks as in the simulator: the one of the flow, else any active one
const agentFor = async (flow: ChatFlow): Promise<AiAgent | null> => {
  const own = flow.agentId ? await AiAgent.findByPk(flow.agentId) : null;
  return own || AiAgent.findOne({ where: { active: true }, order: [["id", "ASC"]] });
};

const present = async (flow: ChatFlow, withGraph = false) => {
  const draft = cleanGraph(flow.draft);
  const issues = validateGraph(draft, { hasAiAgent: await hasActiveAiAgent(), kind: flow.kind });
  const stats = await flowStats(flow.id);
  const agent = flow.agentId ? await AiAgent.findByPk(flow.agentId, { attributes: ["id", "name", "active", "provider", "model"] }) : null;
  return {
    id: flow.id,
    kind: flow.kind || "flow",
    agentId: flow.agentId || null,
    agent: agent ? { id: agent.id, name: agent.name, active: agent.active, provider: agent.provider, model: agent.model } : null,
    name: flow.name,
    description: flow.description,
    whatsappId: flow.whatsappId,
    status: flow.status,
    entry: parseEntry(flow.entry),
    version: flow.version,
    publishedAt: flow.publishedAt,
    // the draft differs from what people are talking to
    changed: flow.status === "published" ? JSON.stringify(draft) !== JSON.stringify(parseGraph(flow.published)) : true,
    blocks: draft.nodes.filter(n => n.type !== "comment").length,
    errors: issues.filter(i => i.level === "error").length,
    warnings: issues.filter(i => i.level === "warning").length,
    stats: { started: stats.started, crm: stats.crm, done: stats.done, handoff: stats.handoff, waiting: stats.waiting },
    ...(withGraph ? { graph: draft, issues } : {})
  };
};

// the menus and automations of the chatbot (kind=flow, the default) or the AI agents built in blocks (kind=agent)
export const index = async (req: Request, res: Response): Promise<Response> => {
  const kind = req.query.kind === "agent" ? "agent" : "flow";
  const flows = await ChatFlow.findAll({ where: { kind }, order: [["updatedAt", "DESC"]] });
  return res.json(await Promise.all(flows.map(f => present(f))));
};

export const show = async (req: Request, res: Response): Promise<Response> => res.json(await present(await load(req.params.id), true));

export const templates = async (_req: Request, res: Response): Promise<Response> =>
  res.json(TEMPLATES.map(t => ({ key: t.key, name: t.name, description: t.description, entry: t.entry, blocks: t.graph.nodes.length })));

export const store = async (req: Request, res: Response): Promise<Response> => {
  const b = req.body || {};
  const name = clip(b.name, 80);
  if (!name) throw new AppError("ERR_FIELD_REQUIRED_name", 400);
  const kind = b.kind === "agent" ? "agent" : "flow";
  const template = kind === "flow" ? TEMPLATES.find(t => t.key === b.template) : undefined;
  const graph = b.graph ? cleanGraph(b.graph) : template ? template.graph : blankGraph();
  // an agent in blocks belongs to an AI agent (its persona, model, knowledge and limits)
  let agentId: number | null = null;
  if (kind === "agent") {
    agentId = Number(b.agentId) || null;
    if (!agentId || !(await AiAgent.findByPk(agentId))) throw new AppError("ERR_FIELD_REQUIRED_agentId", 400);
  }
  const flow = await ChatFlow.create({
    name,
    kind,
    agentId,
    description: clip(b.description, 200) || template?.description || null,
    whatsappId: b.whatsappId ? Number(b.whatsappId) : null,
    entry: kind === "agent" ? JSON.stringify({ type: "agent", keywords: [] }) : entryOf(b.entry || template?.entry || { type: "first_message" }),
    draft: JSON.stringify(graph),
    createdBy: uid(req)
  } as any);
  return res.status(201).json(await present(flow, true));
};

export const update = async (req: Request, res: Response): Promise<Response> => {
  const flow = await load(req.params.id);
  const b = req.body || {};
  const patch: any = {};
  if (b.name !== undefined) {
    if (!clip(b.name, 80)) throw new AppError("ERR_FIELD_REQUIRED_name", 400);
    patch.name = clip(b.name, 80);
  }
  if (b.description !== undefined) patch.description = clip(b.description, 200) || null;
  if (b.whatsappId !== undefined) patch.whatsappId = b.whatsappId ? Number(b.whatsappId) : null;
  if (b.entry !== undefined) patch.entry = entryOf(b.entry);
  if (b.graph !== undefined) patch.draft = JSON.stringify(cleanGraph(b.graph));
  await flow.update(patch);
  return res.json(await present(flow, true));
};

export const validate = async (req: Request, res: Response): Promise<Response> => {
  const flow = await load(req.params.id);
  const graph = req.body?.graph ? cleanGraph(req.body.graph) : cleanGraph(flow.draft);
  return res.json({ issues: validateGraph(graph, { hasAiAgent: await hasActiveAiAgent(), kind: flow.kind }) });
};

// the draft becomes what people talk to; a flow with errors never goes live
export const publish = async (req: Request, res: Response): Promise<Response> => {
  const flow = await load(req.params.id);
  const graph = cleanGraph(req.body?.graph || flow.draft);
  const issues = validateGraph(graph, { hasAiAgent: await hasActiveAiAgent(), kind: flow.kind });
  if (issues.some(i => i.level === "error")) return res.status(422).json({ error: "ERR_FLOW_HAS_ERRORS", issues });
  await flow.update({ draft: JSON.stringify(graph), published: JSON.stringify(graph), status: "published", version: flow.version + 1, publishedAt: new Date() });
  // every publication is kept: it can be read and restored later
  await ChatFlowVersion.create({ flowId: flow.id, version: flow.version, graph: JSON.stringify(graph), note: clip(req.body?.note, 200) || null, publishedBy: uid(req) } as any);
  return res.json(await present(flow, true));
};

export const unpublish = async (req: Request, res: Response): Promise<Response> => {
  const flow = await load(req.params.id);
  await flow.update({ status: "draft" });
  // people in the middle of it are let go: the rest of the automation takes over
  await ChatFlowRun.update({ status: "done" }, { where: { flowId: flow.id, status: ["waiting", "delayed"] } as any });
  return res.json(await present(flow, true));
};

// the publications of a flow, newest first
export const versions = async (req: Request, res: Response): Promise<Response> => {
  const flow = await load(req.params.id);
  const rows = await ChatFlowVersion.findAll({ where: { flowId: flow.id }, order: [["version", "DESC"], ["id", "DESC"]], limit: 50 });
  const users = await User.findAll({ where: { id: [...new Set(rows.map(r => r.publishedBy).filter(Boolean))] as number[] }, attributes: ["id", "name"] });
  return res.json(
    rows.map(r => ({
      id: r.id,
      version: r.version,
      note: r.note,
      at: r.createdAt,
      by: users.find(u => u.id === r.publishedBy)?.name || null,
      blocks: parseGraph(r.graph).nodes.filter(n => n.type !== "comment").length,
      current: flow.status === "published" && r.version === flow.version
    }))
  );
};

// an old publication comes back as the draft (nothing changes for the people talking until it is published again)
export const restoreVersion = async (req: Request, res: Response): Promise<Response> => {
  const flow = await load(req.params.id);
  const row = await ChatFlowVersion.findOne({ where: { id: Number(req.params.versionId), flowId: flow.id } });
  if (!row) throw new AppError("ERR_NOT_FOUND", 404);
  await flow.update({ draft: JSON.stringify(cleanGraph(row.graph)) });
  return res.json(await present(flow, true));
};

export const duplicate = async (req: Request, res: Response): Promise<Response> => {
  const flow = await load(req.params.id);
  const copy = await ChatFlow.create({ name: clip(`${flow.name} (cópia)`, 80), kind: flow.kind || "flow", agentId: flow.agentId, description: flow.description, whatsappId: flow.whatsappId, entry: flow.entry, draft: flow.draft, createdBy: uid(req) } as any);
  return res.status(201).json(await present(copy, true));
};

export const remove = async (req: Request, res: Response): Promise<Response> => {
  const flow = await load(req.params.id);
  await ChatFlowRun.destroy({ where: { flowId: flow.id } });
  await ChatFlowStat.destroy({ where: { flowId: flow.id } });
  await AutomationTrigger.update({ flowId: null, active: false } as any, { where: { flowId: flow.id } });
  await flow.destroy();
  return res.json({ ok: true });
};

export const stats = async (req: Request, res: Response): Promise<Response> => res.json(await flowStats((await load(req.params.id)).id));

// The simulator: talks to the DRAFT with nothing leaving the system. The caller keeps `state` between calls.
export const simulate = async (req: Request, res: Response): Promise<Response> => {
  const flow = await load(req.params.id);
  const b = req.body || {};
  const graph = cleanGraph(b.graph || flow.draft);
  const issues = validateGraph(graph, { hasAiAgent: await hasActiveAiAgent(), kind: flow.kind });
  if (issues.some(i => i.level === "error" && /início/.test(i.text))) return res.status(422).json({ error: "ERR_FLOW_HAS_ERRORS", issues });
  // an AI stage really answers in the simulator (with the model of the agent), without sending or saving anything
  const { fx, messages, actions, traces } = simEffects(b.sample || {}, { agent: await agentFor(flow), flowId: flow.id });
  let step;
  try {
    if (b.state && b.state.nodeId && !b.restart) {
      const state: RunState = { nodeId: String(b.state.nodeId), vars: b.state.vars || {}, tries: Number(b.state.tries) || 0 };
      step = await resume(graph, state, String(b.input ?? ""), fx);
    } else {
      const start = firstNode(graph);
      if (!start) throw new AppError("ERR_FLOW_HAS_ERRORS", 422);
      step = await advance(graph, start.id, { nodeId: null, vars: {}, tries: 0, pending: b.input ? String(b.input) : null }, fx);
    }
  } catch (err) {
    if (err instanceof AppError) throw err;
    // the provider refused (no key, no balance): the screen says so instead of a blank error
    const code = String(err?.message || "");
    throw new AppError(code === "ERR_AI_NO_API_KEY" ? "ERR_AI_NO_API_KEY" : "ERR_AI_FAILED", code === "ERR_AI_NO_API_KEY" ? 400 : 502);
  }
  return res.json({ messages, actions, traces, status: step.status, state: step.state, path: step.path, resumeAfterMinutes: step.resumeAt ? Math.round((step.resumeAt.getTime() - Date.now()) / 60000) : null });
};

// the old menu of the chatbot, shown as a flow (a draft: nothing changes for the people talking to the bot)
export const importLegacy = async (req: Request, res: Response): Promise<Response> => {
  const whatsappId = req.body?.whatsappId ? Number(req.body.whatsappId) : null;
  const graph = await legacyToGraph(whatsappId);
  if (!graph) throw new AppError("ERR_NOT_FOUND", 404);
  const flow = await ChatFlow.create({ name: "Menu atual do chatbot", description: "Importado do menu antigo", whatsappId, entry: JSON.stringify({ type: "first_message" }), draft: JSON.stringify(graph), createdBy: uid(req) } as any);
  return res.status(201).json(await present(flow, true));
};

// "Criar com IA": a description in plain words becomes a draft flow with its buttons, questions and CRM actions
export const generate = async (req: Request, res: Response): Promise<Response> => {
  const description = clip(req.body?.description, 3000);
  if (description.length < 10) throw new AppError("ERR_FIELD_REQUIRED_description", 400);
  const out = await generateFlow(description);
  const graph = autoLayout(out.graph);
  const flow = await ChatFlow.create({
    name: clip(req.body?.name, 80) || out.name,
    description: "Criado com IA a partir da sua descrição",
    whatsappId: req.body?.whatsappId ? Number(req.body.whatsappId) : null,
    entry: JSON.stringify(out.entry),
    draft: JSON.stringify(graph),
    createdBy: uid(req)
  } as any);
  return res.status(201).json(await present(flow, true));
};
