import { Op } from "sequelize";

import { getSetting } from "../helpers/AppSettings";
import { getBusinessConfig, isBusinessNow } from "../helpers/BusinessTime";
import AgentMetricEvent from "../models/AgentMetricEvent";
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
import { logger } from "../utils/logger";
import { firstName, nudgeText } from "../services/CommercialServices/Nudges";

// A lead the AI agent was talking to who stops answering gets up to TWO gentle reminders, only while the WhatsApp service window is still open
// (24 hours after the lead's last message: free text is allowed), during the company's working hours, never to someone who asked to stop, and
// never once a person took the conversation. A lead who promised a day to come back (follow-up) is left to the consultant's task. When the lead
// writes again the count starts over (see Hook). Setting `ai_reactivation` = "0" turns it off.
const MARK = "‎";
const FIRST_AFTER_MS = 3 * 3600000;
const SECOND_AFTER_MS = 9 * 3600000;
const WINDOW_LIMIT_MS = 22 * 3600000;

const tick = async (): Promise<void> => {
  try {
    if ((await getSetting("ai_reactivation", "1")) === "0") return;
    if (!isBusinessNow(await getBusinessConfig())) return;
    const now = Date.now();
    const rows = await LeadCommercial.findAll({
      where: {
        lastInboundAt: { [Op.between]: [new Date(now - WINDOW_LIMIT_MS), new Date(now - FIRST_AFTER_MS)] },
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
      await remind(row, now);
    }
  } catch (err) {
    logger.warn(`AI reactivation tick failed: ${err}`);
  }
};

const remind = async (row: LeadCommercial, now: number): Promise<void> => {
  const state = await loadState(row.leadId);
  const nudges = Number(state.slots.nudges || 0);
  if (nudges >= 2) return;
  const since = Math.max(state.slots.lastOutboundAt ? new Date(state.slots.lastOutboundAt).getTime() : 0, state.slots.nudgeAt ? new Date(state.slots.nudgeAt).getTime() : 0);
  if (now - since < (nudges === 0 ? FIRST_AFTER_MS : SECOND_AFTER_MS)) return;

  const lead = await Lead.findByPk(row.leadId);
  if (!lead || !lead.contactId) return;
  const ticket = await Ticket.findOne({ where: { contactId: lead.contactId, status: { [Op.ne]: "closed" }, isGroup: false, aiActive: true, userId: { [Op.is]: null } } as any, order: [["id", "DESC"]] });
  if (!ticket) return;
  // the agent is still waiting for this lead in a conversation (not a flow that ended)
  if (!(await ChatFlowRun.findOne({ where: { ticketId: ticket.id, status: "waiting" }, attributes: ["id"] }))) return;

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
    await AgentMetricEvent.create({ leadId: lead.id, agentId: state.agentId, flowId: state.flowId, event: "reactivation", once: false, meta: JSON.stringify({ n: nudges + 1 }) } as any).catch(() => undefined);
    await addActivity(lead.id, null, "whatsapp", `Agente de IA enviou o lembrete ${nudges + 1} de 2 (o lead parou de responder).`).catch(() => undefined);
  } finally {
    await releaseAi(ticket.id);
  }
};

export const startAiReactivation = (): void => {
  setInterval(tick, Number(process.env.REACTIVATION_MS) || 10 * 60000).unref?.();
};

export { tick as runAiReactivationOnce };
