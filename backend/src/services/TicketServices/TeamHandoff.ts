import { createHash } from "crypto";
import { Op } from "sequelize";

import AppError from "../../errors/AppError";
import Lead from "../../models/Lead";
import Queue from "../../models/Queue";
import Ticket from "../../models/Ticket";
import TicketEvent from "../../models/TicketEvent";
import User from "../../models/User";
import { logger } from "../../utils/logger";
import { askOnce, resolveKey } from "../AiServices/RunAiAgent";
import { connectionOfTeam, sideOfSegment, Team } from "../ChannelServices/ConnectionTeam";
import { contactTranscript } from "../CopilotServices/Brief";
import { configOf, quotaExceeded, quotaOf, reserveSuggestion, suggestionAgent } from "../CopilotServices/Settings";
import { policyFor } from "../CopilotServices/Policy";
import { addActivity } from "../CrmServices/LeadCore";
import emitTicketUpdate from "./EmitTicketUpdate";

export const TEAM_LABEL: Record<Team, string> = { tutoria: "tutoria", atendimento: "consultor" };
const SEGMENT_OF: Record<Team, string> = { tutoria: "onboarding", atendimento: "sales" };
const QUEUE_ROLE: Record<Team, string> = { tutoria: "tutoria", atendimento: "comercial" };

const SUMMARY_SYSTEM = [
  "Você prepara um repasse interno entre a equipe comercial e a tutoria de uma faculdade EAD.",
  "Em até 5 linhas, em português: quem é o aluno, o que ele pediu agora, o que já foi respondido e o que o outro lado precisa fazer.",
  "Só fatos da conversa. Nada de valores, prazos ou promessas que não estejam nela."
].join("\n");

// A short summary of THIS conversation for the other side (the other side never reads the conversation itself). Counted in the copilot's
// daily limits; without the AI (switched off, no agent, limit reached or a failure) the person's note goes alone.
const summaryFor = async (ticket: Ticket, team: Team, actorId: number): Promise<string> => {
  try {
    const config = await configOf();
    if (!config.enabled || !config.aiEnabled || !policyFor(config, ticket.whatsappId).enabled) return "";
    const agent = await suggestionAgent(config, ticket);
    if (!agent || quotaExceeded(await quotaOf(config, actorId, ticket.whatsappId))) return "";
    const story = await contactTranscript(ticket, 40, true);
    if (!story.text || !story.lastMessageId) return "";
    const apiKey = await resolveKey(agent);
    if (!apiKey) return "";
    const contextKey = createHash("sha256").update(`handoff:${team}:${story.lastMessageId}`).digest("hex");
    const { request, cached } = await reserveSuggestion(config, ticket, actorId, contextKey, { kind: "handoff" });
    if (cached) return request.status === "ready" ? request.text || "" : "";
    try {
      const out = await askOnce(agent, apiKey, SUMMARY_SYSTEM, `Repasse para a ${TEAM_LABEL[team] === "tutoria" ? "tutoria" : "equipe comercial"}.\n\nConversa:\n${story.text}`, 300, { ticketId: ticket.id, kind: "copilot" });
      const text = String(out.text || "").trim().slice(0, 1500);
      await request.update({ status: text ? "ready" : "failed", text });
      return text;
    } catch (err) {
      await request.update({ status: "failed" });
      throw err;
    }
  } catch (err) {
    logger.warn(`Resumo do repasse (ticket ${ticket.id}) não feito: ${(err as Error).message}`);
    return "";
  }
};

// The student's conversation on a side's number: an open one (kept with whoever holds it), else the last one there (reopened), else a new
// one; given to the owner of that side, or waiting in the polo's queue of that side.
export const sideConversation = async (contactId: number, team: Team, whatsappId: number, ownerId: number | null, queueId: number | null): Promise<Ticket> => {
  const state = { userId: ownerId, status: ownerId ? "open" : "pending", segment: SEGMENT_OF[team], aiActive: false, chatbotNodeId: -1, ...(queueId ? { queueId } : {}) };
  let other = await Ticket.findOne({ where: { contactId, whatsappId, status: { [Op.in]: ["open", "pending"] } } as any, order: [["updatedAt", "DESC"]] });
  if (other) {
    // somebody of that side already holds it: it stays with them
    if (!other.userId) await other.update(state as any); else if (other.segment !== SEGMENT_OF[team]) await other.update({ segment: SEGMENT_OF[team] });
    return other;
  }
  other = await Ticket.findOne({ where: { contactId, whatsappId, isHistorical: false } as any, order: [["updatedAt", "DESC"]] });
  if (other) await other.update({ ...state, closedAt: null, unreadMessages: 0 } as any);
  else other = await Ticket.create({ contactId, whatsappId, unreadMessages: 0, isGroup: false, ...state } as any);
  return other;
};

export interface TeamHandoffResult {
  ticketId: number;
  userId: number | null;
  connectionName: string;
  summary: string;
}

// "Chamar a tutoria" / "Chamar o consultor": the student's conversation on the OTHER side's number is opened (or found) and given to the
// owner of that side (the student's tutor, or the client's consultant; without one, the polo's queue of that side). The person called gets a
// summary of this conversation and the note; this conversation stays where it is, with the same attendant, and neither side reads the other.
export const handoffToTeam = async (ticketId: number, team: Team, actorId: number | null, note = ""): Promise<TeamHandoffResult> => {
  const source = await Ticket.findByPk(ticketId);
  if (!source) throw new AppError("ERR_NO_TICKET_FOUND", 404);
  if (source.isGroup) throw new AppError("ERR_TEAM_HANDOFF_GROUP", 400);
  if (sideOfSegment(source.segment) === team) throw new AppError("ERR_TEAM_HANDOFF_SAME_SIDE", 400);
  const target = await connectionOfTeam(team);
  if (!target) throw new AppError(team === "tutoria" ? "ERR_TEAM_NO_TUTORIA_NUMBER" : "ERR_TEAM_NO_ATENDIMENTO_NUMBER", 400);
  if (target.id === source.whatsappId) throw new AppError("ERR_TEAM_HANDOFF_SAME_SIDE", 400);

  const lead = await Lead.findOne({ where: { contactId: source.contactId }, attributes: ["id", "poloId", "ownerId", "onboardingTutorId"], order: [["updatedAt", "DESC"]] });
  const ownerId = (team === "tutoria" ? lead?.onboardingTutorId : lead?.ownerId) || null;
  const owner = ownerId ? await User.findByPk(ownerId, { attributes: ["id", "name"] }) : null;
  const queue = lead?.poloId ? await Queue.findOne({ where: { poloId: lead.poloId, role: QUEUE_ROLE[team] } as any, attributes: ["id"] }) : null;
  const actor = actorId ? await User.findByPk(actorId, { attributes: ["id", "name"] }) : null;
  const summary = await summaryFor(source, team, actorId || 0);
  const cleanNote = String(note || "").trim().slice(0, 1000);

  const other = await sideConversation(source.contactId, team, target.id, owner ? owner.id : null, queue ? queue.id : null);

  const from = sideOfSegment(source.segment) === "tutoria" ? "a tutoria" : "o comercial";
  const text = [`${actor?.name || (actorId ? "A equipe" : "O agente de IA")} (${from}) chamou ${team === "tutoria" ? "a tutoria" : "o consultor"}.`, cleanNote ? `Recado: ${cleanNote}` : "", summary ? `Resumo da conversa: ${summary}` : ""].filter(Boolean).join("\n");
  await TicketEvent.create({ ticketId: other.id, type: "team_handoff_in", actorId, toUserId: other.userId || null, note: text.slice(0, 4000) } as any);
  await TicketEvent.create({ ticketId: source.id, type: "team_handoff_out", actorId, toUserId: other.userId || null, note: `Chamou ${team === "tutoria" ? "a tutoria" : "o consultor"} (conversa nº ${other.id} no número ${target.name}).${cleanNote ? ` Recado: ${cleanNote}` : ""}`.slice(0, 1000) } as any);
  if (lead) await addActivity(lead.id, actorId, "note", text.slice(0, 2000)).catch(() => undefined);
  await emitTicketUpdate(other.id);
  return { ticketId: other.id, userId: other.userId || null, connectionName: target.name, summary };
};

// The last call received by this conversation from the other side (shown on top of the conversation to the person called)
export const lastHandoffIn = async (ticketId: number): Promise<{ id: number; note: string; createdAt: Date } | null> => {
  const ev = await TicketEvent.findOne({ where: { ticketId, type: "team_handoff_in" } as any, order: [["createdAt", "DESC"]] });
  return ev ? { id: ev.id, note: (ev as any).note || "", createdAt: ev.createdAt } : null;
};
