import { Request, Response } from "express";
import AiAgent from "../models/AiAgent";
import { getSetting, setSetting } from "../helpers/AppSettings";
import { getSecretSetting, setSecretSetting } from "../helpers/SecretSettings";
import { isMasked, maskSecret } from "../helpers/Secrets";
import makeCrud from "./crudFactory";
import axios from "axios";
import { Op, fn, col, QueryTypes } from "sequelize";
import sequelize from "../database";
import AppError from "../errors/AppError";
import KbDocument from "../models/KbDocument";
import KbChunk from "../models/KbChunk";
import AiUsage from "../models/AiUsage";
import Ticket from "../models/Ticket";
import Course from "../models/Course";
import { addDocument, indexDocument, ensureLegacy, searchChunks } from "../services/AiServices/Kb";
import AiLearning from "../models/AiLearning";
import { approve, discard } from "../services/AiServices/Learning";
import { respond } from "../services/AiServices/RunAiAgent";
import { priceOf, tokensToday } from "../services/AiServices/Usage";
import { DEFAULT_SLOTS } from "../services/AiServices/Tools";
import { isUrlSafe, safeRequest } from "../helpers/SafeUrl";
import { dayBounds, shiftDays } from "../helpers/AppTime";
import ChatFlow from "../models/ChatFlow";
import ChatFlowRun from "../models/ChatFlowRun";
import ChatFlowStat from "../models/ChatFlowStat";
import { AGENT_TEMPLATES, convertAgent, templateSummary } from "../services/FlowServices/AgentTemplates";
import { generateAgent } from "../services/FlowServices/GenerateAgent";
import { defaultProvider } from "../services/AiServices/Keys";
import { ensurePipeline } from "../services/CommercialServices/Pipeline";

const crud = makeCrud(AiAgent, {
  fields: [
    "name",
    "provider",
    "model",
    "apiKey",
    "systemPrompt",
    "knowledgeBase",
    "handoffMessage",
    "maxHistory",
    "active",
    "queueId",
    "whatsappId",
    "persona",
    "maxTokens",
    "dailyTokenCap",
    "handoffAfterTurns",
    "waitSeconds",
    "slots",
    "functions",
    "reviewNumber",
    "reviewWhatsappId",
    "learnFromTeam"
  ],
  required: ["name", "model"],
  beforeSave: data => {
    if (isMasked(data.apiKey)) delete data.apiKey;
    if (data.reviewNumber !== undefined) {
      const digits = String(data.reviewNumber || "").replace(/\D/g, "");
      if (digits && (digits.length < 10 || digits.length > 15)) throw new AppError("ERR_REVIEW_NUMBER_INVALID");
      // Brazilian numbers typed with area code only get the country code
      data.reviewNumber = digits ? (digits.length <= 11 ? `55${digits}` : digits) : null;
    }
    if (data.functions !== undefined) {
      // only what the tools can use: a short name, when to use it and a flow
      const seen = new Set<string>();
      data.functions = (Array.isArray(data.functions) ? data.functions : [])
        .map((f: any) => ({ name: String(f?.name || "").toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 30), description: String(f?.description || "").trim().slice(0, 200), flowId: Number(f?.flowId) || 0 }))
        .filter((f: any) => f.name && f.description && f.flowId && !seen.has(f.name) && seen.add(f.name))
        .slice(0, 10);
    }
    ["queueId", "whatsappId", "reviewWhatsappId"].forEach(k => {
      if (data[k] === "" || data[k] === 0) data[k] = null;
    });
    return data;
  }
});

export const { index, show, store, update } = crud;

// the agent goes with its blocks (the flows of kind agent that talk as it)
export const remove = async (req: Request, res: Response): Promise<Response> => {
  const flows = await ChatFlow.findAll({ where: { agentId: Number(req.params.id) } });
  for (const f of flows) {
    // eslint-disable-next-line no-await-in-loop
    await ChatFlowRun.destroy({ where: { flowId: f.id } });
    // eslint-disable-next-line no-await-in-loop
    await ChatFlowStat.destroy({ where: { flowId: f.id } });
    // eslint-disable-next-line no-await-in-loop
    await f.destroy();
  }
  return crud.remove(req, res);
};

export const getKeys = async (_req: Request, res: Response): Promise<Response> =>
  res.json({
    anthropic: maskSecret(await getSecretSetting("ai_anthropic_key")) || "",
    openai: maskSecret(await getSecretSetting("ai_openai_key")) || ""
  });

export const setKeys = async (req: Request, res: Response): Promise<Response> => {
  const { anthropic, openai } = req.body;
  if (anthropic !== undefined && !isMasked(anthropic)) {
    await setSecretSetting("ai_anthropic_key", anthropic);
  }
  if (openai !== undefined && !isMasked(openai)) {
    await setSecretSetting("ai_openai_key", openai);
  }
  return res.json({ ok: true });
};

// ------------------------------------------------------------------ agents in blocks

const DEFAULT_MODEL = "claude-haiku-5-5";
const uid = (req: Request): number => Number(req.user.id);

export const agentTemplates = async (_req: Request, res: Response): Promise<Response> => res.json(AGENT_TEMPLATES.map(templateSummary));

// An agent made from a ready example: the persona, a few answers in the knowledge base and the blocks. It starts turned off (and as
// a draft): nobody is answered until the team reviews it, publishes it and turns it on.
interface NewAgent {
  name: string;
  persona: { systemPrompt: string; tone: string; rules: string; forbidden: string; handoffMessage: string; unknownMessage: string };
  faq: Array<{ title: string; content: string; keywords?: string }>;
  graph: any;
  description: string;
  kb?: Array<{ title: string; content: string; topic: string; keywords?: string }>;
  // map (and create when missing) the columns of the commercial funnel
  funnel?: boolean;
}

// the agent (turned off), its answers in the knowledge base and its blocks (a draft)
const createAgentWithFlow = async (a: NewAgent, userId: number): Promise<{ agentId: number; flowId: number; funnel?: { created: string[]; missing: string[] } }> => {
  const access = await defaultProvider();
  const agent = await AiAgent.create({
    name: a.name,
    provider: access.provider,
    model: access.model || DEFAULT_MODEL,
    systemPrompt: a.persona.systemPrompt,
    handoffMessage: a.persona.handoffMessage,
    persona: { tone: a.persona.tone, rules: a.persona.rules, forbidden: a.persona.forbidden, unknownMessage: a.persona.unknownMessage },
    active: false,
    maxTokens: 350,
    handoffAfterTurns: 14,
    waitSeconds: 4,
    learnFromTeam: true
  } as any);
  for (const f of a.faq) {
    // eslint-disable-next-line no-await-in-loop
    await addDocument({ title: f.title, content: f.content, kind: "faq", source: "texto", keywords: f.keywords, agentId: agent.id } as any);
  }
  for (const k of a.kb || []) {
    // eslint-disable-next-line no-await-in-loop
    await addDocument({ title: k.title, content: k.content, kind: "doc", source: "texto", keywords: k.keywords, topic: k.topic, agentId: agent.id } as any);
  }
  const flow = await ChatFlow.create({ name: a.name, kind: "agent", agentId: agent.id, entry: JSON.stringify({ type: "agent", keywords: [] }), draft: JSON.stringify(a.graph), description: a.description, createdBy: userId } as any);
  const funnel = a.funnel ? await ensurePipeline({ create: true }) : undefined;
  return { agentId: agent.id, flowId: flow.id, ...(funnel ? { funnel: { created: funnel.created, missing: funnel.missing } } : {}) };
};

export const fromTemplate = async (req: Request, res: Response): Promise<Response> => {
  const t = AGENT_TEMPLATES.find(x => x.key === req.body?.template);
  if (!t) throw new AppError("ERR_NOT_FOUND", 404);
  const name = String(req.body?.name || t.name).trim().slice(0, 80) || t.name;
  // the funnel of the commercial agent is mapped and completed unless the person unchecked it
  const funnel = !!t.commercial && req.body?.createFunnel !== false;
  return res.status(201).json(await createAgentWithFlow({ name, persona: t.persona, faq: t.faq, kb: t.kb, graph: t.graph, description: `Modelo: ${t.name}`, funnel }, uid(req)));
};

// "Criar com IA": a description of the business becomes the agent, its answers and its blocks (checked and fixed by the system before
// it is shown); it opens as a draft for the team to review
export const generate = async (req: Request, res: Response): Promise<Response> => {
  const description = String(req.body?.description || "").trim().slice(0, 3000);
  if (description.length < 20) throw new AppError("ERR_FIELD_REQUIRED_description", 400);
  const out = await generateAgent(description, req.body?.segment);
  const name = String(req.body?.name || out.agent.name).trim().slice(0, 80) || out.agent.name;
  const made = await createAgentWithFlow({ name, persona: out.agent.persona, faq: out.agent.faq, graph: out.agent.graph, description: "Criado com IA a partir da sua descrição" }, uid(req));
  return res.status(201).json({ ...made, attempts: out.attempts, issues: out.issues });
};

// The agent of today as blocks, in a draft (nothing changes for the people talking until it is published)
export const convert = async (req: Request, res: Response): Promise<Response> => {
  const agent = await AiAgent.findByPk(req.params.id);
  if (!agent) throw new AppError("ERR_NOT_FOUND", 404);
  const graph = await convertAgent(agent);
  const flow = await ChatFlow.create({ name: `${agent.name} (em blocos)`.slice(0, 80), kind: "agent", agentId: agent.id, entry: JSON.stringify({ type: "agent", keywords: [] }), draft: JSON.stringify(graph), description: "Convertido do agente de prompt único", createdBy: uid(req) } as any);
  return res.status(201).json({ flowId: flow.id });
};

// ------------------------------------------------------------------ knowledge base

const loadAgent = async (id: string) => {
  const agent = await AiAgent.findByPk(id);
  if (!agent) throw new AppError("ERR_NOT_FOUND", 404);
  return agent;
};

export const kbList = async (req: Request, res: Response): Promise<Response> => {
  const agent = await loadAgent(req.params.id);
  await ensureLegacy(agent);
  const docs = await KbDocument.findAll({
    where: { agentId: { [Op.or]: [agent.id, null] } } as any,
    attributes: { exclude: ["content"] },
    order: [["id", "DESC"]]
  });
  const counts: any[] = await KbChunk.findAll({
    attributes: ["documentId", [fn("COUNT", col("id")), "n"]],
    where: { documentId: docs.map(d => d.id) },
    group: ["documentId"],
    raw: true
  });
  return res.json(
    docs.map(d => ({ ...d.toJSON(), chunks: Number(counts.find(c => c.documentId === d.id)?.n || 0), shared: d.agentId === null }))
  );
};

export const kbShow = async (req: Request, res: Response): Promise<Response> => {
  const doc = await KbDocument.findByPk(req.params.docId);
  if (!doc) throw new AppError("ERR_NOT_FOUND", 404);
  return res.json(doc);
};

// the subject of a document: "institutional/tutoring", "courses/12/overview" (the passages are read only when the question is about it)
const topicOf = (v: any): string | null => {
  const t = String(v ?? "").trim().toLowerCase();
  if (!t) return null;
  if (!/^[a-z0-9_-]+(\/[a-z0-9_-]+){0,2}$/.test(t)) throw new AppError("ERR_KB_TOPIC_INVALID", 400);
  return t;
};
const courseOf = async (v: any): Promise<number | null> => {
  const id = Number(v);
  if (!id) return null;
  if (!(await Course.findByPk(id, { attributes: ["id"] }))) throw new AppError("ERR_NOT_FOUND", 404);
  return id;
};

export const kbAdd = async (req: Request, res: Response): Promise<Response> => {
  const agent = await loadAgent(req.params.id);
  const { title, content, kind, keywords, shared, topic, courseId } = req.body || {};
  const text = String(content || "").trim();
  if (!String(title || "").trim()) throw new AppError("ERR_FIELD_REQUIRED_title");
  if (!text) throw new AppError("ERR_KB_EMPTY");
  const doc = await addDocument({
    title,
    content: text.slice(0, 200000),
    kind: kind === "faq" ? "faq" : "doc",
    keywords,
    topic: topicOf(topic),
    courseId: await courseOf(courseId),
    agentId: shared ? null : agent.id
  });
  return res.status(201).json(doc);
};

export const kbUpdate = async (req: Request, res: Response): Promise<Response> => {
  const doc = await KbDocument.findByPk(req.params.docId);
  if (!doc) throw new AppError("ERR_NOT_FOUND", 404);
  const { title, content, keywords, topic, courseId } = req.body || {};
  await doc.update({
    ...(topic !== undefined ? { topic: topicOf(topic) } : {}),
    ...(courseId !== undefined ? { courseId: await courseOf(courseId) } : {}),
    ...(title !== undefined ? { title: String(title).trim().slice(0, 250) } : {}),
    ...(content !== undefined ? { content: String(content).slice(0, 200000) } : {}),
    ...(keywords !== undefined ? { keywords } : {})
  });
  await indexDocument(doc);
  return res.json(doc);
};

export const kbRemove = async (req: Request, res: Response): Promise<Response> => {
  await KbChunk.destroy({ where: { documentId: req.params.docId } });
  await KbDocument.destroy({ where: { id: req.params.docId } });
  return res.json({ message: "deleted" });
};

// text of an uploaded file: txt/md/csv/json as they are, PDF and DOCX through their readers
const textOfFile = async (file: Express.Multer.File): Promise<string> => {
  const name = file.originalname.toLowerCase();
  if (name.endsWith(".pdf")) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pdf = require("pdf-parse/lib/pdf-parse.js");
    return (await pdf(file.buffer)).text;
  }
  if (name.endsWith(".docx")) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mammoth = require("mammoth");
    return (await mammoth.extractRawText({ buffer: file.buffer })).value;
  }
  if (/\.(txt|md|csv|json|html?)$/.test(name)) {
    const raw = file.buffer.toString("utf8");
    return /\.html?$/.test(name) ? stripHtml(raw) : raw;
  }
  throw new AppError("ERR_KB_FILE_TYPE");
};

const stripHtml = (html: string): string =>
  html
    .replace(/<(script|style|nav|footer|header)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/(p|div|h[1-6]|li|tr|br)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*/g, "\n\n")
    .trim();

export const kbUpload = async (req: Request, res: Response): Promise<Response> => {
  const agent = await loadAgent(req.params.id);
  const file = (req as any).file as Express.Multer.File | undefined;
  if (!file) throw new AppError("ERR_KB_EMPTY");
  let text = "";
  try {
    text = (await textOfFile(file)).trim();
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError("ERR_KB_FILE_READ");
  }
  if (!text) throw new AppError("ERR_KB_FILE_READ");
  const doc = await addDocument({
    title: String(req.body?.title || "").trim() || file.originalname,
    content: text.slice(0, 200000),
    source: "arquivo",
    topic: topicOf(req.body?.topic),
    courseId: await courseOf(req.body?.courseId),
    agentId: req.body?.shared === "true" ? null : agent.id
  });
  return res.status(201).json(doc);
};

export const kbFromUrl = async (req: Request, res: Response): Promise<Response> => {
  const agent = await loadAgent(req.params.id);
  const url = String(req.body?.url || "").trim();
  if (!(await isUrlSafe(url))) throw new AppError("ERR_KB_URL");
  let html = "";
  try {
    const r = await safeRequest({ url, method: "GET", timeout: 10000, maxContentLength: 2 * 1024 * 1024, responseType: "text" });
    html = String(r.data);
  } catch (err) {
    throw new AppError("ERR_KB_URL_FETCH");
  }
  const text = stripHtml(html);
  if (text.length < 40) throw new AppError("ERR_KB_URL_FETCH");
  const doc = await addDocument({
    title: String(req.body?.title || "").trim() || url.replace(/^https?:\/\//, "").slice(0, 120),
    content: text.slice(0, 200000),
    source: "url",
    topic: topicOf(req.body?.topic),
    courseId: await courseOf(req.body?.courseId),
    agentId: req.body?.shared ? null : agent.id
  });
  return res.status(201).json(doc);
};

// ------------------------------------------------------------------ tester and usage

// "Testar agente": the same brain without WhatsApp. Nothing is written except the usage (not counted against the daily limit).
export const test = async (req: Request, res: Response): Promise<Response> => {
  const agent = await loadAgent(req.params.id);
  const history = (Array.isArray(req.body?.messages) ? req.body.messages : [])
    .filter((m: any) => m && ["user", "assistant"].includes(m.role) && String(m.content || "").trim())
    .map((m: any) => ({ role: m.role, content: String(m.content).slice(0, 2000) }));
  if (!history.length || history[history.length - 1].role !== "user") throw new AppError("ERR_AI_NO_HISTORY");
  try {
    const result = await respond(agent, {
      ticket: null,
      history,
      collected: req.body?.collected || {},
      summary: null,
      sandbox: true
    });
    return res.json({
      text: result.handoff
        ? "(o agente passaria a conversa para uma pessoa)"
        : result.unknown
        ? "(o agente não sabe responder: avisaria a equipe e guardaria a pergunta para você ensinar)"
        : result.text,
      handoff: result.handoff,
      unknown: result.unknown,
      sources: result.sources,
      tools: result.tools,
      collected: result.collected,
      tokens: result.tokens
    });
  } catch (err) {
    if (err.message === "ERR_AI_NO_API_KEY") throw new AppError("ERR_AI_NO_API_KEY");
    throw new AppError("ERR_AI_FAILED", 502);
  }
};

export const usage = async (req: Request, res: Response): Promise<Response> => {
  const agent = await loadAgent(req.params.id);
  const days = Math.min(30, Math.max(1, Number(req.query.days) || 7));
  const since = shiftDays(dayBounds().start, -(days - 1));
  const rows: any[] = await AiUsage.findAll({
    attributes: ["model", "kind", [fn("SUM", col("inputTokens")), "input"], [fn("SUM", col("outputTokens")), "output"], [fn("SUM", col("cacheReadTokens")), "cacheRead"], [fn("COUNT", col("id")), "calls"]],
    where: { agentId: agent.id, createdAt: { [Op.gte]: since } },
    group: ["model", "kind"],
    raw: true
  });
  const perDay: any[] = await sequelize.query(
    `SELECT TO_CHAR("createdAt" AT TIME ZONE :tz, 'YYYY-MM-DD') AS day, SUM("inputTokens") AS input, SUM("outputTokens") AS output, COUNT(*) AS calls
       FROM "AiUsage" WHERE "agentId" = :id AND kind <> 'test' AND "createdAt" >= :since GROUP BY 1 ORDER BY 1`,
    { replacements: { tz: process.env.APP_TIMEZONE || "America/Porto_Velho", id: agent.id, since }, type: QueryTypes.SELECT }
  ).catch(() => []);
  // the conversations THIS agent answered (a ticket counts once, for the agent whose model calls and turns are in it)
  const answeredRows: any[] = await sequelize.query(
    `SELECT COUNT(*) AS n FROM (
       SELECT "ticketId" FROM "AiUsage" WHERE "agentId" = :id AND "kind" <> 'test' AND "ticketId" IS NOT NULL AND "createdAt" >= :since
       UNION SELECT "ticketId" FROM "AgentTurnLogs" WHERE "agentId" = :id AND "ticketId" IS NOT NULL AND "createdAt" >= :since
     ) t`,
    { replacements: { id: agent.id, since }, type: QueryTypes.SELECT }
  ).catch(() => []);
  const answered = Number(answeredRows[0]?.n || 0);
  const price = await priceOf(agent.model);
  const live = rows.filter(r => r.kind !== "test");
  const input = live.reduce((a, r) => a + Number(r.input || 0), 0);
  const output = live.reduce((a, r) => a + Number(r.output || 0), 0);
  return res.json({
    days,
    today: await tokensToday(agent.id),
    cap: agent.dailyTokenCap,
    total: { input, output, cacheRead: live.reduce((a, r) => a + Number(r.cacheRead || 0), 0), calls: live.reduce((a, r) => a + Number(r.calls || 0), 0) },
    conversations: answered,
    perDay: perDay.map(d => ({ day: d.day, input: Number(d.input), output: Number(d.output), calls: Number(d.calls) })),
    // only when the administrator typed the price of this model in Settings
    costUsd: price ? Math.round(((input * price.in + output * price.out) / 1e6) * 100) / 100 : null
  });
};

export const defaults = async (_req: Request, res: Response): Promise<Response> => res.json({ slots: DEFAULT_SLOTS, model: "claude-haiku-5-5" });

// ------------------------------------------------------------------ learning (review what the agent should learn)

// "Which passages would the agent read for this question?" Helps the owner see what is missing from the base.
export const kbSearch = async (req: Request, res: Response): Promise<Response> => {
  const agent = await loadAgent(req.params.id);
  const question = String(req.body?.question || "").trim();
  if (!question) throw new AppError("ERR_KB_EMPTY");
  await ensureLegacy(agent);
  const hits = await searchChunks(agent.id, question, 4);
  return res.json(hits.map(h => ({ title: h.title, content: h.content, score: Math.round(h.score * 1000) / 1000 })));
};

export const learningList = async (req: Request, res: Response): Promise<Response> => {
  const agent = await loadAgent(req.params.id);
  const all = await AiLearning.findAll({ where: { agentId: agent.id }, order: [["id", "DESC"]], limit: 300 });
  const counts: Record<string, number> = { aguardando_equipe: 0, para_revisar: 0, aprovada: 0, descartada: 0 };
  all.forEach(r => { counts[r.status] = (counts[r.status] || 0) + 1; });
  const status = String(req.query.status || "");
  return res.json({ counts, rows: status ? all.filter(r => r.status === status) : all });
};

export const learningPending = async (_req: Request, res: Response): Promise<Response> =>
  res.json({ count: await AiLearning.count({ where: { status: "para_revisar" } }) });

const loadLearning = async (id: string) => {
  const row = await AiLearning.findByPk(id);
  if (!row) throw new AppError("ERR_NOT_FOUND", 404);
  return row;
};

export const learningUpdate = async (req: Request, res: Response): Promise<Response> => {
  const row = await loadLearning(req.params.id);
  const { question, suggestedAnswer } = req.body || {};
  await row.update({
    ...(question !== undefined ? { question: String(question).slice(0, 1000) } : {}),
    ...(suggestedAnswer !== undefined ? { suggestedAnswer: String(suggestedAnswer).slice(0, 4000), status: row.status === "aguardando_equipe" && String(suggestedAnswer).trim() ? "para_revisar" : row.status, answerSource: row.answerSource || "dono" } : {})
  });
  return res.json(row);
};

export const learningApprove = async (req: Request, res: Response): Promise<Response> => {
  const row = await loadLearning(req.params.id);
  if (row.status === "aprovada") throw new AppError("ERR_LEARNING_DONE");
  try {
    return res.json(await approve(row, req.body || {}));
  } catch (err) {
    if (err.message === "ERR_LEARNING_EMPTY") throw new AppError("ERR_LEARNING_EMPTY");
    throw err;
  }
};

export const learningDiscard = async (req: Request, res: Response): Promise<Response> =>
  res.json(await discard(await loadLearning(req.params.id)));

// The owner teaches directly (for example after seeing a wrong answer in the tester)
export const learningTeach = async (req: Request, res: Response): Promise<Response> => {
  const agent = await loadAgent(req.params.id);
  const question = String(req.body?.question || "").trim();
  const answer = String(req.body?.answer || "").trim();
  if (!question || !answer) throw new AppError("ERR_LEARNING_EMPTY");
  const row = await AiLearning.create({ agentId: agent.id, question: question.slice(0, 1000), suggestedAnswer: answer, status: "para_revisar", answerSource: "dono" } as any);
  return res.status(201).json(await approve(row, { asFaq: !!req.body?.asFaq, shared: !!req.body?.shared }));
};
