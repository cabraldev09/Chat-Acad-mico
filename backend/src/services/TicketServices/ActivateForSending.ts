import Ticket from "../../models/Ticket";
import Contact from "../../models/Contact";
import { getIO } from "../../libs/socket";

// WhatsApp has no "reopen": writing in a chat is enough. Groups and conversations copied from the phone's history
// (and team members' chats) are therefore opened by the first message the team sends (no "Reabrir atendimento" button in the way).
const ActivateForSending = async (ticket: Ticket, userId: number): Promise<Ticket> => {
  let plain = ticket.isGroup;
  if (!plain && ticket.status !== "open") {
    const contact = await Contact.findByPk(ticket.contactId, { attributes: ["id", "isStaff"] });
    plain = !!contact?.isStaff;
  }
  const needs = ticket.isHistorical || (plain && ticket.status !== "open");
  if (!needs) return ticket;

  const wasHistory = ticket.isHistorical;
  await ticket.update({
    status: "open",
    userId: ticket.userId || userId,
    closedAt: null,
    isHistorical: false,
    chatbotNodeId: null,
    ...(wasHistory ? { firstResponseAt: null } : {})
  });
  if (wasHistory) await Ticket.update({ createdAt: new Date() } as any, { where: { id: ticket.id }, silent: true } as any);
  getIO().to(ticket.status).to(String(ticket.id)).to("notification").emit("ticket", { action: "update", ticket });
  return ticket;
};

export default ActivateForSending;
