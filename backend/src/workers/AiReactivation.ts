import { Op } from "sequelize";

import { getSetting } from "../helpers/AppSettings";
import { getBusinessConfig, isBusinessNow } from "../helpers/BusinessTime";
import AgentMetricEvent from "../models/AgentMetricEvent";
import AiAgent from "../models/AiAgent";
import ChatFlowRun from "../models/ChatFlowRun";
import Contact from "../models/Contact";
import Lead from "../models/Lead";
import LeadCommercial from "../models/LeadCommercial";
import Ticket from "../models/Ticket";
import Whatsapp from "../models/Whatsapp";
import { claimAi, releaseAi } from "../services/FlowServices/Claim";
import { addActivity } from "../services/CrmServices/LeadCore";
import { assertCanSend } from "../services/CrmServices/RetentionLog";
import { loadState, saveState } from "../services/CommercialServices/Slots";
import SendWhatsAppMessage from "../services/WbotServices/SendWhatsAppMessage";
import ShowTicketService from "../services/TicketServices/ShowTicketService";
import { noteAutomation } from "../services/AutomationServices/AutomationTrace";
import { handoffToHuman } from "../services/AiServices/Handoff";
import { findAgentForTicket } from "../services/AiServices/RunAiAgent";
import { logger } from "../utils/logger";
import { HANDOFF_AFTER_LAST_MS, NUDGES, firstName, nudgeDue, nudgeText } from "../services/CommercialServices/Nudges";

// A lead the AI agent was talking to who stops answering gets up to THREE reminders: "tá por aí?" 10 minutes after the last word of the agent
// (Setting `ai_reactivation_minutes`, any hour: the conversation was happening a moment ago), then a question about doubts after 3 hours and the
// offer of the consultant after 9 hours (these two only in the working hours). Only while the WhatsApp service window is open (24 hours after the
// lead's last message), never to someone who asked to stop, never once a person took the conversation, never to a lead who promised a day to come
// back. A lead who already said the course and still does not answer 2 hours after the last reminder goes to the consultant of the polo. When the
// lead writes again the count starts over (see Hook) and the stage goes on from where it stopped. Setting `ai_reactivation` = "0" turns it off.
const MARK = "‎";
const WINDOW_LIMIT_MS = 22 * 3600000;

const tick = async (): Promise<void> => {
  try {
    if ((await getSetting("ai_reactivation", "1")) === "0") return;
    const minutes = Number(await getSetting("ai_reactivation_minutes", "10"));
    const firstMinutes = Number.isFinite(minutes) && minutes >= 1 ? minutes : 10;
    const businessNow = isBusinessNow(await getBusinessConfig());
    const now = Date.now();
    const rows = await LeadCommercial.findAll({
      where: {
        lastInboundAt: { [Op.between]: [new Date(now - WINDOW_LIMIT_MS), new Date(now - firstMinutes * 60000)] },
        readyForProposal: false,
        readyForConsultant: false,
        followUpAt: { [Op.is]: null }
      } as any,
      limit: 100
    });
    for (const row of rows) {
      // the agent spoke last (the lead did not answer)
      if (!row.lastOutboundAt || new Date(row.lastOutboundAt).getTime() <= new Date(row.lastInboundAt).getTime()) continue;
      // eslint-disable-next-line no-await-in-loop
      await remind(row, now, { firstMinutes, businessNow });
    }
  } catch (err) {
    logger.warn(`AI reactivation tick failed: ${err}`);
  }
};

const remind = async (row: LeadCommercial, now: number, opts: { firstMinutes: number; businessNow: boolean }): Promise<void> => {
  const state = await loadState(row.leadId);
  const nudges = Number(state.slots.nudges || 0);
  const since = Math.max(state.slots.lastOutboundAt ? new Date(state.slots.lastOutboundAt).getTime() : 0, state.slots.nudgeAt ? new Date(state.slots.nudgeAt).getTime() : 0);
  const due = nudgeDue(nudges, since, now, opts);
  // every reminder went out and the lead, who already said what they want, still did not answer: the consultant calls
  const giveUp = !due && nudges >= NUDGES && opts.businessNow && now - since >= HANDOFF_AFTER_LAST_MS && !!(state.slots.courseName || state.slots.courseId);
  if (!due && !giveUp) return;

  const lead = await Lead.findByPk(row.leadId);
  if (!lead || !lead.contactId) return;
  const ticket = await Ticket.findOne({ where: { contactId: lead.contactId, status: { [Op.ne]: "closed" }, isGroup: false, aiActive: true, userId: { [Op.is]: null } } as any, order: [["id", "DESC"]] });
  if (!ticket) return;
  // the agent is still waiting for this lead in a conversation (not a flow that ended)
  const run = await ChatFlowRun.findOne({ where: { ticketId: ticket.id, status: "waiting" }, attributes: ["id"] });
  if (!run) return;

  if (giveUp) {
    if (!(await claimAi(ticket.id))) return;
    try {
      const agent = (state.agentId ? await AiAgent.findByPk(state.agentId) : null) || (await findAgentForTicket(ticket));
      if (!agent) return;
      await run.update({ status: "handoff", resumeAt: null } as any);
      await handoffToHuman(ticket.id, agent, "sem_resposta", undefined, "no_reply");
      noteAutomation(ticket.id, "o lead não respondeu aos lembretes: a conversa foi para o consultor do polo chamar");
      await addActivity(lead.id, null, "system", "O lead parou de responder depois dos 3 lembretes do agente de IA: a conversa foi para o consultor.").catch(() => undefined);
    } finally {
      await releaseAi(ticket.id);
    }
    return;
  }

  const contact = await Contact.findByPk(ticket.contactId);
  const whatsapp = await Whatsapp.findByPk(ticket.whatsappId);
  if (!contact || !whatsapp) return;
  if (!(await claimAi(ticket.id))) return;
  try {
    try {
      await assertCanSend(contact, whatsapp);
    } catch (_) {
      // opted out, window closed, daily limit or a number that never talked in safe mode: no reminder (the consultant's task remains)
      return;
    }
    const text = nudgeText(nudges, firstName(state.slots.leadName || lead.name), state.slots.courseName);
    await SendWhatsAppMessage({ body: `${MARK}${text}`, ticket: await ShowTicketService(ticket.id), automated: true });
    state.slots.nudges = nudges + 1;
    state.slots.nudgeAt = new Date().toISOString();
    await saveState(state);
    noteAutomation(ticket.id, `o lead parou de responder: o agente mandou o lembrete ${nudges + 1} de ${NUDGES} ("${text}")`);
    await AgentMetricEvent.create({ leadId: lead.id, agentId: state.agentId, flowId: state.flowId, event: "reactivation", once: false, meta: JSON.stringify({ n: nudges + 1 }) } as any).catch(() => undefined);
    await addActivity(lead.id, null, "whatsapp", `Agente de IA enviou o lembrete ${nudges + 1} de ${NUDGES} (o lead parou de responder).`).catch(() => undefined);
  } finally {
    await releaseAi(ticket.id);
  }
};

export const startAiReactivation = (): void => {
  setInterval(tick, Number(process.env.REACTIVATION_MS) || 60000).unref?.();
};

export { tick as runAiReactivationOnce };
