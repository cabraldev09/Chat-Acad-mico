import { Op } from "sequelize";

import AgentMetricEvent from "../../models/AgentMetricEvent";
import CurricularAnalysis from "../../models/CurricularAnalysis";
import Lead from "../../models/Lead";
import LeadCommercial from "../../models/LeadCommercial";
import Ticket from "../../models/Ticket";
import { logger } from "../../utils/logger";
import ShowTicketService from "../TicketServices/ShowTicketService";
import SendWhatsAppMessage from "../WbotServices/SendWhatsAppMessage";
import { analysisSlots } from "./Academic";
import { commercialTurn } from "./Hook";
import { canAutoMove } from "./Rules";
import { dbPorts } from "./Ports";
import { loadState } from "./Slots";

// Things that happen outside the conversation and still belong to the journey of the lead: the proposal is sent by a consultant, the
// enrollment is confirmed by the system, the curricular analysis is finished by the team. Only leads that talked to the AI agent count.
const MARK = "‎";

const known = async (leadId: number): Promise<LeadCommercial | null> => LeadCommercial.findOne({ where: { leadId } });

// A milestone of the funnel, once per lead (the unique index of the table makes a second call harmless).
export const markMilestone = async (leadId: number, event: "proposal_sent" | "enrollment_started" | "enrolled", meta?: Record<string, any>): Promise<void> => {
  try {
    const row = await known(leadId);
    if (!row) return;
    await AgentMetricEvent.create({ leadId, agentId: row.agentId, flowId: row.flowId, event, once: true, meta: meta ? JSON.stringify(meta).slice(0, 1000) : null } as any);
  } catch (err) {
    // already recorded for this lead
  }
};

// The charge of the enrollment was created: the lead goes to "Matrícula em andamento" (by this code, never by the model).
export const onEnrollmentStarted = async (leadId: number): Promise<void> => {
  try {
    const row = await known(leadId);
    if (!row) return;
    const lead = await Lead.findByPk(leadId);
    if (!lead) return;
    const state = await loadState(leadId);
    const ports = dbPorts(lead, state, { agentId: state.agentId, flowId: state.flowId });
    if (canAutoMove(await ports.stageKeyNow(), "enrollment_in_progress")) await ports.moveStage("enrollment_in_progress", "cobrança da matrícula criada");
    await ports.event("enrollment_started");
    await ports.save();
  } catch (err) {
    logger.warn(`Commercial enrollment milestone failed: ${(err as Error).message}`);
  }
};

// The team finished (or reviewed) the analysis of a lead the AI is attending: the state, the column and the score follow, and the person
// is told that the result is ready (a fixed sentence, no model) so the answer to it opens the explanation.
export const onAnalysisCompleted = async (row: CurricularAnalysis): Promise<void> => {
  try {
    if (row.status !== "COMPLETED" || !row.leadId) return;
    const exists = await known(row.leadId);
    if (!exists) return;
    const lead = await Lead.findByPk(row.leadId);
    if (!lead) return;
    const state = await loadState(lead.id);
    if (state.slots.analysisStatus === "completed" && state.slots.analysisId === row.id) return;
    const ports = dbPorts(lead, state, { agentId: state.agentId, flowId: state.flowId });
    await commercialTurn(ports, { userText: "", patch: { hasTranscript: true, ...analysisSlots(row) }, tools: [], hadText: false, replied: false });
    await ports.event("analysis_requested");
    await ports.event("analysis_completed");

    const ticket = lead.contactId ? await Ticket.findOne({ where: { contactId: lead.contactId, status: { [Op.in]: ["open", "pending"] } }, order: [["id", "DESC"]] }) : null;
    if (!ticket) return;
    const first = String(lead.name || "").trim().split(/\s+/)[0];
    const full = await ShowTicketService(ticket.id);
    await SendWhatsAppMessage({
      body: `${MARK}Boa notícia${first ? `, ${first}` : ""}! A sua análise curricular foi concluída. Posso te explicar o resultado agora?`,
      ticket: full,
      automated: true
    });
  } catch (err) {
    logger.warn(`Commercial analysis milestone failed: ${(err as Error).message}`);
  }
};
