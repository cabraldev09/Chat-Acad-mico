import { Transaction } from "sequelize";
import Ticket from "../../models/Ticket";
import Contact from "../../models/Contact";
import { getIO } from "../../libs/socket";
import ClaimTicketService from "./ClaimTicketService";

// Whoever sends the first message of a conversation that has no attendant becomes its attendant: the claim is one locked,
// conditional write (see ClaimTicketService), so the message and the owner can never disagree, and a conversation that
// belongs to someone else refuses the send (ERR_TICKET_ALREADY_ASSIGNED) instead of being taken.
// Returns the conversation as it is after the claim.
//
// WhatsApp has no "reopen": writing in a chat is enough. Groups and conversations copied from the phone's history
// (and team members' chats) are therefore opened by the first message the team sends (no "Reabrir atendimento" button in the way).
// Groups have no single attendant: whoever is in them already took part, so they are only opened, never claimed.
const ActivateForSending = async (ticket: Ticket, userId: number, transaction?: Transaction): Promise<Ticket> => {
  if (ticket.isGroup) {
    if (!ticket.isHistorical && ticket.status === "open") return ticket;
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
  }

  let plain = false;
  if (ticket.status !== "open") {
    const contact = await Contact.findByPk(ticket.contactId, { attributes: ["id", "isStaff", "isPersonal"] });
    plain = !!contact?.isStaff || !!contact?.isPersonal;
  }
  const allowReopen = ticket.isHistorical || plain;
  const { ticket: claimed } = await ClaimTicketService({ ticketId: ticket.id, userId, reason: "send", allowReopen, transaction });
  return claimed;
};

export default ActivateForSending;
