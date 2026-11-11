import { Op } from "sequelize";
import Ticket from "../../models/Ticket";
import Lead from "../../models/Lead";
import ChatFlowRun from "../../models/ChatFlowRun";
import Message from "../../models/Message";
import ShowTicketService from "../TicketServices/ShowTicketService";
import { isWithinBusinessHours } from "../AutomationServices/BusinessHours";
import { findAgentForTicket } from "./RunAiAgent";
import { policyOf, reminderIsDue, wantsToStop } from "./Policy";
import { handoffToHuman } from "./Handoff";

// One fixed reminder per unanswered exchange: no model call, no paid template.
export const remindAiTicket = async (ticketId: number, say: (ticket: Ticket, body: string) => Promise<void>): Promise<void> => {
  const ticket = await ShowTicketService(ticketId);
  const agent = await findAgentForTicket(ticket);
  if (!agent || ticket.isGroup || ticket.isHistorical || !ticket.whatsapp || !isWithinBusinessHours(ticket.whatsapp)) return;
  const config = policyOf(agent.persona).followUp;
  if (!config.enabled) return;
  if (ticket.chatbotNodeId !== null && ticket.chatbotNodeId !== undefined && ticket.chatbotNodeId >= 0) return;
  if (await ChatFlowRun.count({ where: { ticketId, status: { [Op.in]: ["waiting", "delayed"] } } })) return;
  const lead = await Lead.findOne({ where: { contactId: ticket.contactId }, attributes: ["wonAt", "lostAt"] });
  if (lead?.wonAt || lead?.lostAt) return;
  const [inbound, latest] = await Promise.all([
    Message.findOne({ where: { ticketId, fromMe: false, isDeleted: false }, order: [["createdAt", "DESC"], ["id", "DESC"]] }),
    Message.findOne({ where: { ticketId, isDeleted: false }, order: [["createdAt", "DESC"], ["id", "DESC"]] })
  ]);
  if (!latest?.fromMe || !inbound || wantsToStop(inbound.body)) return;
  if (!reminderIsDue({
    enabled: config.enabled, minutes: config.minutes, now: Date.now(),
    lastInbound: new Date(inbound.createdAt).getTime(), lastOutbound: new Date(latest.createdAt).getTime(),
    reminded: !!ticket.botReminderAt, active: ticket.aiActive, assigned: !!ticket.userId,
    closed: ticket.status === "closed", optedOut: !!ticket.contact?.optOut
  })) return;

  // Compare-and-set also protects against overlapping worker ticks/processes.
  const [claimed] = await Ticket.update({ botReminderAt: new Date() }, {
    where: {
      id: ticketId, aiActive: true, userId: { [Op.is]: null }, status: { [Op.ne]: "closed" },
      botReminderAt: { [Op.is]: null }, updatedAt: ticket.updatedAt, lastMessageId: latest.id
    } as any
  });
  if (!claimed) return;
  const fresh = await ShowTicketService(ticketId);
  const current = await Message.findOne({ where: { ticketId, isDeleted: false }, order: [["createdAt", "DESC"], ["id", "DESC"]] });
  if (!fresh.aiActive || fresh.userId || fresh.status === "closed" || fresh.contact?.optOut || current?.id !== latest.id) return;
  try {
    await say(fresh, config.message);
  } catch (err) {
    // Do not retry an ambiguous delivery and charge twice. Leave a handoff for the team.
    await handoffToHuman(ticketId, agent, "sem_resposta");
    throw err;
  }
};
