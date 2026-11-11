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
import { loadState } from "../services/CommercialServices/Slots";
import { briefOf } from "../services/CommercialServices/Rules";
import { respond, loadHistory } from "../services/AiServices/RunAiAgent";

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
  return res.json({ ...process, enabled: true, aiAvailable: !note, aiNote: note, quota, canManage: isManagerRole(roleOf(req.user)) });
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
export const suggest = async (req: Request, res: Response) => {
  const ticket = await ticketOf(req);
  const config = await configOf();
  if (!eligible(ticket) || !config.enabled || !config.aiEnabled || !policyFor(config, ticket.whatsappId).enabled) throw new AppError("ERR_COPILOT_DISABLED", 403);
  if (!ticket.userId || ticket.aiActive) throw new AppError("ERR_COPILOT_CLAIM", 409);
  const agent = await suggestionAgent(config, ticket);
  if (!agent) return res.json({ text: "", note: "Peça ao administrador para escolher um agente nas configurações do copiloto." });
  const last = await Message.findOne({ where: { ticketId: ticket.id, isDeleted: false } as any, order: [["createdAt", "DESC"], ["id", "DESC"]] });
  if (!last || last.fromMe) return res.json({ text: "", note: "Aguarde uma mensagem do contato antes de pedir uma sugestão." });
  const history = await loadHistory(ticket, 12);
  if (!history.length || history[history.length - 1].role !== "user") return res.json({ text: "", note: "Não há mensagem do contato para responder agora." });
  const [step, lead] = await Promise.all([copilotOf(ticket, config), Lead.findOne({ where: { contactId: ticket.contactId }, attributes: ["id"] })]);
  const state = lead ? await loadState(lead.id) : null;
  const guide = [
    "Escreva a próxima mensagem do CONSULTOR que assumiu a conversa. Use a voz dele, sem se apresentar como assistente virtual. Seja profissional, breve e sem emoji.",
    "Responda primeiro o que a pessoa perguntou e conduza com uma pergunta para a próxima etapa. Nunca invente valores, bolsas, prazos ou confirmação de matrícula.",
    `Processo aprovado pelo gestor:\n${step.steps.map(s => `${s.done ? "Concluído" : s.key === step.current ? "ATUAL" : "Pendente"}: ${s.label}. ${s.instruction}`).join("\n")}`,
    step.suggestion ? `Texto de referência da próxima etapa:\n${step.suggestion.text}` : ""
  ].filter(Boolean).join("\n\n");
  const contextKey = createHash("sha256").update(JSON.stringify({ messageId: last.id, body: last.body, progress: step.steps.map(s => [s.key, s.done]) })).digest("hex");
  const { request, cached } = await reserveSuggestion(config, ticket, Number(req.user.id), contextKey);
  if (cached) return res.json({ text: request.status === "ready" ? request.text : "", cached: true, note: request.status === "pending" && Date.now() - +new Date(request.createdAt) < 180000 ? "A sugestão desta mensagem já está sendo preparada. Aguarde." : "Esta mensagem já foi processada. Use o roteiro ou aguarde uma nova mensagem." });
  try {
    const result = await respond(agent, { ticket: null, accountingTicketId: ticket.id, usageKind: "copilot", history, summary: [state ? briefOf(state) : "", guide].filter(Boolean).join("\n\n"), collected: null, sandbox: true });
    const text = result.handoff || result.unknown ? "" : String(result.text || "").replace(/\[(HANDOFF|DESCONHECIDO)\]/g, "").trim();
    await request.update({ status: "ready", text });
    return res.json({ text, note: text ? "" : "Não há informação suficiente na base. Confira com a equipe e use o roteiro para continuar." });
  } catch (err) {
    // Keep the attempt counted: the provider may have processed it before the connection failed.
    await request.update({ status: "failed" });
    const code = String((err as Error).message || "");
    if (/ERR_AI_TOKEN_CAP|ERR_AI_RATE_REQUIRED/.test(code)) throw new AppError("ERR_COPILOT_TOKEN_LIMIT", 429);
    if (/ERR_AI_NO_API_KEY/.test(code)) throw new AppError("ERR_AI_NO_API_KEY", 400);
    throw new AppError("ERR_AI_SUGGEST_FAILED", 502);
  }
};
