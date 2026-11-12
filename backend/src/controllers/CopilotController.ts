import { getIO } from "../libs/socket";
import { createHash } from "crypto";
import { Request, Response } from "express";
import sequelize from "../database";
import Ticket from "../models/Ticket";
import Message from "../models/Message";
import Lead from "../models/Lead";
import CopilotProgress from "../models/CopilotProgress";
import AppError from "../errors/AppError";
import { isManagerRole, roleOf } from "../helpers/Roles";
import { policyFor } from "../services/CopilotServices/Policy";
import { configOf, saveConfig, quotaOf, quotaExceeded, suggestionAgent, reserveSuggestion } from "../services/CopilotServices/Settings";
import { copilotOf } from "../services/CommercialServices/Process";
import { hydrate, loadState } from "../services/CommercialServices/Slots";
import { briefOf } from "../services/CommercialServices/Rules";
import { respond, loadHistory, askOnce, resolveKey } from "../services/AiServices/RunAiAgent";
import CopilotRequest from "../models/CopilotRequest";
import TicketEvent from "../models/TicketEvent";
import User from "../models/User";
import { Op } from "sequelize";
import { dayBounds } from "../helpers/AppTime";
import { BRIEF_SYSTEM, contactTranscript, parseBrief, sameSideWhere } from "../services/CopilotServices/Brief";
import { sideOfSegment } from "../services/ChannelServices/ConnectionTeam";

export const settings = async (_req: Request, res: Response) => res.json(await configOf());
export const updateSettings = async (req: Request, res: Response) => {
  const config = await saveConfig(req.body);
  getIO().emit("copilot", { action: "config", version: config.version });
  return res.json(config);
};
const ticketOf = async (req: Request): Promise<Ticket> => {
  const ticket = await Ticket.findByPk(req.params.ticketId);
  if (!ticket) throw new AppError("ERR_NO_TICKET_FOUND", 404);
  return ticket;
};
const eligible = (ticket: Ticket): boolean => !ticket.isGroup && !ticket.isHistorical && ticket.status !== "closed";
export const show = async (req: Request, res: Response) => {
  const ticket = await ticketOf(req);
  const config = await configOf();
  if (!eligible(ticket) || !config.enabled || !policyFor(config, ticket.whatsappId).enabled) return res.json({ enabled: false });
  const [process, quota, agent] = await Promise.all([copilotOf(ticket, config), quotaOf(config, Number(req.user.id), ticket.whatsappId), config.aiEnabled ? suggestionAgent(config, ticket) : null]);
  const note = !config.aiEnabled ? "Sugestões de IA desativadas pelo administrador." : !agent ? "O administrador precisa escolher um agente para as sugestões." : quotaExceeded(quota) ? "Limite diário atingido. Continue com o processo e os textos prontos." : !ticket.userId || ticket.aiActive ? "Assuma a conversa para pedir uma sugestão." : "";
  // a client who comes back with a story (earlier attendances) or arrives by a transfer: the summary of the AI is made as the consultant opens it
  // the summary does not need the conversation taken (the consultant reads it before answering); it is made by itself only for the attendant
  const briefAvailable = config.aiEnabled && !!agent && !quotaExceeded(quota);
  let autoBrief = false;
  if (briefAvailable && ticket.userId === Number(req.user.id) && !ticket.aiActive) {
    const since = new Date(ticket.createdAt);
    const [made, older, handed] = await Promise.all([
      CopilotRequest.count({ where: { ticketId: ticket.id, kind: "brief", createdAt: { [Op.gte]: since } } as any }),
      Message.count({ where: { ticketId: { [Op.in]: (await Ticket.findAll({ where: sameSideWhere(ticket), attributes: ["id"] })).map(t => t.id) }, createdAt: { [Op.lt]: new Date(since.getTime() - 60000) } } as any }),
      TicketEvent.count({ where: { ticketId: ticket.id, type: ["transfer", "returned_to_owner"], createdAt: { [Op.gte]: since } } as any })
    ]);
    autoBrief = !made && (older > 0 || handed > 0);
  }
  return res.json({ ...process, enabled: true, aiAvailable: !note, aiNote: note, briefAvailable, autoBrief, quota, canManage: isManagerRole(roleOf(req.user)) });
};
export const progress = async (req: Request, res: Response) => {
  const ticket = await ticketOf(req);
  const config = await configOf();
  if (!eligible(ticket) || !config.enabled || !policyFor(config, ticket.whatsappId).enabled) throw new AppError("ERR_COPILOT_DISABLED", 403);
  const { key, done } = req.body || {};
  if (!config.steps.some(s => s.key === key) || key === "enroll" || !(typeof done === "boolean" || done === null)) throw new AppError("ERR_COPILOT_PROGRESS", 400);
  await sequelize.transaction(async transaction => {
    await sequelize.query("SELECT pg_advisory_xact_lock(918276, :id)", { replacements: { id: ticket.id }, transaction });
    const previous = await CopilotProgress.findByPk(ticket.id, { transaction });
    const overrides = { ...(previous?.overrides || {}) };
    if (done === null) delete overrides[key]; else overrides[key] = done;
    await CopilotProgress.upsert({ ticketId: ticket.id, overrides, updatedBy: Number(req.user.id) }, { transaction });
  });
  getIO().to(String(ticket.id)).emit("copilot", { action: "progress", ticketId: ticket.id });
  return show(req, res);
};
// the variations a consultant can ask of a suggestion
const MODES: Record<string, string> = {
  regenerar: "Escreva uma alternativa diferente da anterior, com outra abordagem.",
  mais_curta: "Escreva uma versão bem mais curta: no máximo 2 frases.",
  mais_formal: "Use um tom mais formal e institucional.",
  mais_calorosa: "Use um tom mais próximo e acolhedor, ainda profissional."
};
const lastBriefOf = async (ticketId: number): Promise<CopilotRequest | null> =>
  CopilotRequest.findOne({ where: { ticketId, kind: "brief", status: "ready" } as any, order: [["createdAt", "DESC"]] });
const briefJson = (r: CopilotRequest | null) => {
  if (!r?.text) return null;
  try { return JSON.parse(r.text); } catch { return null; }
};

export const suggest = async (req: Request, res: Response) => {
  const ticket = await ticketOf(req);
  const mode = typeof req.body?.mode === "string" && MODES[req.body.mode] ? String(req.body.mode) : null;
  const config = await configOf();
  if (!eligible(ticket) || !config.enabled || !config.aiEnabled || !policyFor(config, ticket.whatsappId).enabled) throw new AppError("ERR_COPILOT_DISABLED", 403);
  if (!ticket.userId || ticket.aiActive) throw new AppError("ERR_COPILOT_CLAIM", 409);
  const agent = await suggestionAgent(config, ticket);
  if (!agent) return res.json({ text: "", note: "Peça ao administrador para escolher um agente nas configurações do copiloto." });
  const last = await Message.findOne({ where: { ticketId: ticket.id, isDeleted: false } as any, order: [["createdAt", "DESC"], ["id", "DESC"]] });
  if (!last || last.fromMe) return res.json({ text: "", note: "Aguarde uma mensagem do contato antes de pedir uma sugestão." });
  const history = await loadHistory(ticket, 20);
  if (!history.length || history[history.length - 1].role !== "user") return res.json({ text: "", note: "Não há mensagem do contato para responder agora." });
  const [step, lead] = await Promise.all([copilotOf(ticket, config), Lead.findOne({ where: { contactId: ticket.contactId } })]);
  const state = lead ? await hydrate(await loadState(lead.id), lead) : null;
  const guide = [
    "Escreva a próxima mensagem do CONSULTOR que assumiu a conversa. Use a voz dele, sem se apresentar como assistente virtual. Seja profissional, breve e sem emoji.",
    "Responda primeiro o que a pessoa perguntou e conduza com uma pergunta para a próxima etapa. Nunca invente valores, bolsas, prazos ou confirmação de matrícula.",
    `Processo aprovado pelo gestor:\n${step.steps.map(s => `${s.done ? "Concluído" : s.key === step.current ? "ATUAL" : "Pendente"}: ${s.label}. ${s.instruction}`).join("\n")}`,
    step.suggestion ? `Texto de referência da próxima etapa:\n${step.suggestion.text}` : ""
  ].filter(Boolean).join("\n\n");
  // the summary of the whole story of the client (when the consultant already asked for it) helps the reply not to repeat questions
  const brief = briefJson(await lastBriefOf(ticket.id));
  const story = brief ? `Resumo do histórico do cliente: ${brief.resumo}${brief.pendencias?.length ? `\nPendências: ${brief.pendencias.join("; ")}` : ""}` : "";
  const summary = [state ? briefOf(state) : "", story, guide, mode ? `Variação pedida pelo consultor: ${MODES[mode]}` : ""].filter(Boolean).join("\n\n");
  const contextKey = createHash("sha256").update(JSON.stringify({ messageId: last.id, body: last.body, summary, mode, progress: step.steps.map(s => [s.key, s.done]) })).digest("hex");
  const { request, cached } = await reserveSuggestion(config, ticket, Number(req.user.id), contextKey, { kind: "suggestion", mode });
  const sourcesOf = (r: CopilotRequest) => { try { return JSON.parse(r.sources || "[]"); } catch { return []; } };
  if (cached) return res.json({ id: request.id, text: request.status === "ready" ? request.text : "", sources: sourcesOf(request), cached: true, note: request.status === "pending" && Date.now() - +new Date(request.createdAt) < 180000 ? "A sugestão desta mensagem já está sendo preparada. Aguarde." : "Esta mensagem já foi processada. Peça uma variação ou aguarde uma nova mensagem." });
  try {
    const result = await respond(agent, { ticket: null, accountingTicketId: ticket.id, usageKind: "copilot", history, summary, collected: null, sandbox: true });
    const text = result.handoff || result.unknown ? "" : String(result.text || "").replace(/\[(HANDOFF|DESCONHECIDO)\]/g, "").trim();
    const sources = [...new Set(result.sources || [])].slice(0, 5);
    await request.update({ status: "ready", text, sources: JSON.stringify(sources) });
    return res.json({ id: request.id, text, sources, mode, note: text ? "" : "Não há informação suficiente na base. Confira com a equipe e use o roteiro para continuar." });
  } catch (err) {
    // Keep the attempt counted: the provider may have processed it before the connection failed.
    await request.update({ status: "failed" });
    const code = String((err as Error).message || "");
    if (/ERR_AI_TOKEN_CAP|ERR_AI_RATE_REQUIRED/.test(code)) throw new AppError("ERR_COPILOT_TOKEN_LIMIT", 429);
    if (/ERR_AI_NO_API_KEY/.test(code)) throw new AppError("ERR_AI_NO_API_KEY", 400);
    throw new AppError("ERR_AI_SUGGEST_FAILED", 502);
  }
};

// The whole story of the client summed up by the AI, with the next step: what a consultant needs when the client comes back or arrives
// by a transfer. Counted in the same daily limits as the suggestions, and made once per new message (the same story is not paid twice).
export const brief = async (req: Request, res: Response) => {
  const ticket = await ticketOf(req);
  const config = await configOf();
  if (!eligible(ticket) || !config.enabled || !config.aiEnabled || !policyFor(config, ticket.whatsappId).enabled) throw new AppError("ERR_COPILOT_DISABLED", 403);
  const agent = await suggestionAgent(config, ticket);
  if (!agent) return res.json({ brief: null, note: "Peça ao administrador para escolher um agente nas configurações do copiloto." });
  const story = await contactTranscript(ticket, 60);
  if (!story.lastMessageId || !story.text) return res.json({ brief: null, note: "Ainda não há mensagens para resumir." });
  const contextKey = createHash("sha256").update(`brief:${story.lastMessageId}`).digest("hex");
  const { request, cached } = await reserveSuggestion(config, ticket, Number(req.user.id), contextKey, { kind: "brief" });
  if (cached) {
    const ready = request.status === "ready" ? briefJson(request) : null;
    return res.json({ id: request.id, brief: ready, cached: true, conversations: story.conversations, note: ready ? "" : request.status === "pending" ? "O resumo já está sendo preparado. Aguarde." : "Não foi possível resumir agora." });
  }
  try {
    const apiKey = await resolveKey(agent);
    if (!apiKey) throw new Error("ERR_AI_NO_API_KEY");
    const lead = await Lead.findOne({ where: { contactId: ticket.contactId } });
    const state = lead ? await hydrate(await loadState(lead.id), lead) : null;
    const side = sideOfSegment(ticket.segment) === "tutoria" ? "a TUTORIA (tutor do aluno matriculado)" : "o COMERCIAL (consultor de matrículas)";
    const user = [`Quem atende esta conversa é ${side}.`, state ? `Ficha do CRM:\n${briefOf(state)}` : "", `Atendimentos: ${story.conversations}. Consultores que já atenderam: ${story.attendants.join(", ") || "nenhum"}.`, `Histórico:\n${story.text}`].filter(Boolean).join("\n\n");
    const out = await askOnce(agent, apiKey, BRIEF_SYSTEM, user, 700, { ticketId: ticket.id, kind: "copilot" });
    const parsed = parseBrief(out.text);
    await request.update({ status: parsed ? "ready" : "failed", text: parsed ? JSON.stringify(parsed) : null });
    return res.json({ id: request.id, brief: parsed, conversations: story.conversations, note: parsed ? "" : "A IA não conseguiu resumir esta conversa. Tente de novo depois de uma nova mensagem." });
  } catch (err) {
    await request.update({ status: "failed" });
    const code = String((err as Error).message || "");
    if (/ERR_AI_TOKEN_CAP|ERR_AI_RATE_REQUIRED/.test(code)) throw new AppError("ERR_COPILOT_TOKEN_LIMIT", 429);
    if (/ERR_AI_NO_API_KEY/.test(code)) throw new AppError("ERR_AI_NO_API_KEY", 400);
    throw new AppError("ERR_AI_SUGGEST_FAILED", 502);
  }
};

// The last summary of the client made for this conversation (opening the conversation again does not pay for a new one)
export const lastBrief = async (req: Request, res: Response) => {
  const ticket = await ticketOf(req);
  const row = await lastBriefOf(ticket.id);
  return res.json({ id: row?.id || null, brief: briefJson(row), createdAt: row?.createdAt || null });
};

const ownRequest = async (req: Request): Promise<CopilotRequest> => {
  const row = await CopilotRequest.findOne({ where: { id: Number(req.params.requestId), ticketId: Number(req.params.ticketId) } });
  if (!row) throw new AppError("ERR_NOT_FOUND", 404);
  if (row.userId !== Number(req.user.id) && !isManagerRole(roleOf(req.user))) throw new AppError("ERR_NO_PERMISSION", 403);
  return row;
};

// 👍 / 👎 on a suggestion or a summary (with an optional reason): what the team finds useful
export const feedback = async (req: Request, res: Response) => {
  const row = await ownRequest(req);
  const value = req.body?.feedback === "util" || req.body?.feedback === "nao_util" ? req.body.feedback : null;
  if (!value && req.body?.feedback !== null) throw new AppError("ERR_COPILOT_FEEDBACK", 400);
  await row.update({ feedback: value, feedbackReason: value === "nao_util" ? String(req.body?.reason || "").trim().slice(0, 300) || null : null });
  return res.json({ id: row.id, feedback: row.feedback });
};

// "Usar e editar": the suggestion went to the message box; the next message sent says if it went as it was or edited
export const take = async (req: Request, res: Response) => {
  const row = await ownRequest(req);
  await row.update({ outcome: "taken" });
  return res.json({ id: row.id, outcome: row.outcome });
};

// How the copilot is being used: per consultant, the suggestions and summaries asked, how many went out as they were, edited or were
// discarded, and the 👍 / 👎. From the start of the day `days` ago (default 30).
export const usage = async (req: Request, res: Response) => {
  const days = Math.min(180, Math.max(1, Number(req.query.days) || 30));
  const since = new Date(dayBounds().start.getTime() - (days - 1) * 86400000);
  const rows = await CopilotRequest.findAll({ where: { createdAt: { [Op.gte]: since } } as any, attributes: ["userId", "kind", "status", "outcome", "feedback"], raw: true }) as any[];
  const users = await User.findAll({ where: { id: [...new Set(rows.map(r => r.userId))] }, attributes: ["id", "name"] });
  const name = new Map(users.map(u => [u.id, u.name]));
  const blank = () => ({ suggestions: 0, briefs: 0, failed: 0, taken: 0, used: 0, edited: 0, discarded: 0, useful: 0, notUseful: 0 });
  const per = new Map<number, ReturnType<typeof blank>>();
  const total = blank();
  rows.forEach(r => {
    const m = per.get(r.userId) || blank();
    [m, total].forEach(x => {
      if (r.kind === "brief") x.briefs += 1; else x.suggestions += 1;
      if (r.status === "failed") x.failed += 1;
      if (r.outcome === "taken") x.taken += 1;
      if (r.outcome === "used") x.used += 1;
      if (r.outcome === "edited") x.edited += 1;
      if (r.outcome === "discarded") x.discarded += 1;
      if (r.feedback === "util") x.useful += 1;
      if (r.feedback === "nao_util") x.notUseful += 1;
    });
    per.set(r.userId, m);
  });
  return res.json({ days, total, users: [...per.entries()].map(([id, v]) => ({ userId: id, name: name.get(id) || `#${id}`, ...v })).sort((a, b) => b.suggestions + b.briefs - (a.suggestions + a.briefs)) });
};
