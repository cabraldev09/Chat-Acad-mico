import AgentMetricEvent from "../../models/AgentMetricEvent";
import Lead from "../../models/Lead";
import LeadCommercial from "../../models/LeadCommercial";
import LeadStage from "../../models/LeadStage";
import TicketEvent from "../../models/TicketEvent";
import { logger } from "../../utils/logger";
import { addActivity } from "../CrmServices/LeadCore";
import Message from "../../models/Message";
import { briefOf, hashOf } from "./Rules";
import { CommercialState, loadState, saveState } from "./Slots";

// The handoff to the consultant: one text with everything the AI found out, written in the conversation (so the person who takes over
// sees it above the messages) and in the history of the lead. The same text is never written twice in a row.
export const saveBrief = async (ticketId: number, lead: Lead, state: CommercialState, brief: string): Promise<boolean> => {
  const hash = hashOf(brief);
  if (state.slots.lastBriefHash === hash) return false;
  await TicketEvent.create({ ticketId, type: "handoff", actorId: null, note: brief.slice(0, 4000) } as any).catch(err => logger.warn(`handoff brief not saved: ${err}`));
  await addActivity(lead.id, null, "note", brief);
  state.slots.lastBriefHash = hash;
  await saveState(state);
  await AgentMetricEvent.create({ leadId: lead.id, agentId: state.agentId, flowId: state.flowId, event: "handoff_brief", once: true } as any).catch(() => undefined);
  return true;
};

// what the consultant also wants to see: where the lead came from and the last things the lead wrote (short, in their own words)
export const briefContext = async (ticketId: number | null, lead: Lead | null): Promise<{ source: string | null; lastMessages: string[] }> => {
  const source = lead ? [lead.source, lead.utmCampaign ? `campanha ${lead.utmCampaign}` : null].filter(Boolean).join(" · ") || null : null;
  let lastMessages: string[] = [];
  if (ticketId) {
    const rows = await Message.findAll({ where: { ticketId, fromMe: false, isDeleted: false } as any, order: [["createdAt", "DESC"]], limit: 3, attributes: ["body", "mediaType"] }).catch(() => []);
    lastMessages = rows
      .map(m => String(m.body || "").replace(/\s+/g, " ").trim())
      .filter(b => b && !/^\[/.test(b))
      .map(b => (b.length > 140 ? `${b.slice(0, 137)}...` : b))
      .reverse();
  }
  return { source, lastMessages };
};

// For the exits that go to the team without a block of handoff in the flow: when the lead has a commercial state, the brief goes too.
export const briefIfCommercial = async (ticketId: number, lead: Lead): Promise<boolean> => {
  if (!(await LeadCommercial.findOne({ where: { leadId: lead.id }, attributes: ["id"] }))) return false;
  const state = await loadState(lead.id);
  const stage = await LeadStage.findByPk(lead.stageId);
  await saveBrief(ticketId, lead, state, briefOf(state, { stageName: stage?.name || null, ...(await briefContext(ticketId, lead)) }));
  return true;
};
