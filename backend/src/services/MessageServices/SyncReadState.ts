import { Op } from "sequelize";
import Ticket from "../../models/Ticket";
import Contact from "../../models/Contact";
import Message from "../../models/Message";
import { getIO } from "../../libs/socket";

// A read on any linked device clears only state observed before that read.
// Never call sendSeen here: this is provider -> system synchronization.
export const syncChatRead = async (whatsappId: number, chatId: string, observedAt = new Date()): Promise<void> => {
  const key = String(chatId).split("@")[0];
  if (!key) return;
  const contacts = await Contact.findAll({ where: { [Op.or]: [{ number: key }, { lid: key }, { lid: chatId }] }, attributes: ["id"] });
  if (!contacts.length) return;
  const tickets = await Ticket.findAll({ where: { whatsappId, contactId: contacts.map(c => c.id), unreadMessages: { [Op.gt]: 0 } } });
  for (const ticket of tickets) {
    const [changed] = await Ticket.update({ unreadMessages: 0 }, {
      where: { id: ticket.id, updatedAt: { [Op.lte]: observedAt } }, silent: true
    });
    if (!changed) continue;
    await Message.update({ read: true }, { where: { ticketId: ticket.id, fromMe: false, read: false, createdAt: { [Op.lte]: observedAt } } });
    getIO().to(ticket.status).to(String(ticket.id)).to("notification").emit("ticket", { action: "updateUnread", ticketId: ticket.id });
  }
};
