import { chatIdOf } from "./ChatId";
import { getIO } from "../libs/socket";
import Message from "../models/Message";
import Ticket from "../models/Ticket";
import { logger } from "../utils/logger";
import { whatsappProvider } from "../providers/WhatsApp";

// Reading is not taking: only the attendant's own opening (viewerId) marks the conversation as read and tells the contact it was seen.
// Someone who only looks (a supervisor, a colleague, anyone while the AI or nobody is attending) leaves everything as it was.
// Without a viewerId the caller already knows the reader is the attendant (the sender of a message).
const SetTicketMessagesAsRead = async (ticket: Ticket, viewerId?: number): Promise<void> => {
  if (viewerId !== undefined && !ticket.isGroup && ticket.userId !== viewerId) return;
  const hadUnread = Number(ticket.unreadMessages || 0) > 0;
  await Message.update(
    { read: true },
    {
      where: {
        ticketId: ticket.id,
        read: false
      }
    }
  );

  await ticket.update({ unreadMessages: 0 });

  try {
    if (ticket.whatsappId && (ticket.whatsapp?.channel || "whatsapp") === "whatsapp") {
      await whatsappProvider.sendSeen(
        ticket.whatsappId,
        chatIdOf(ticket.contact, ticket.isGroup)
      );
    } else if (hadUnread && viewerId !== undefined && ticket.whatsapp?.channel === "whatsapp_cloud") {
      // the official number: the person sees the two blue ticks when the attendant opens the conversation (not on every message sent)
      const { cloudTypingFor } = await import("./ReplyPace");
      const Whatsapp = (await import("../models/Whatsapp")).default;
      await cloudTypingFor(await Whatsapp.findByPk(ticket.whatsappId), { ticketId: ticket.id }, false);
    }
  } catch (err) {
    logger.warn(
      `Could not mark messages as read. Maybe whatsapp session disconnected? Err: ${err}`
    );
  }

  const io = getIO();
  io.to(ticket.status).to("notification").emit("ticket", {
    action: "updateUnread",
    ticketId: ticket.id
  });
};

export default SetTicketMessagesAsRead;
