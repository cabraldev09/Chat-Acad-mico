import { chatIdOf } from "../../helpers/ChatId";
import AppError from "../../errors/AppError";
import Message from "../../models/Message";
import Ticket from "../../models/Ticket";
import Whatsapp from "../../models/Whatsapp";
import { whatsappProvider } from "../../providers/WhatsApp";

// WhatsApp lets you delete for everyone only for a limited time after sending (about two days)
const EVERYONE_WINDOW_MS = 2 * 24 * 3600 * 1000;

const loadMessage = async (messageId: string): Promise<Message> => {
  const message = await Message.findByPk(messageId, {
    include: [
      {
        model: Ticket,
        as: "ticket",
        include: ["contact", { model: Whatsapp, as: "whatsapp", attributes: ["channel"] }]
      }
    ]
  });
  if (!message) throw new AppError("ERR_NO_MESSAGE_FOUND", 404);
  return message;
};

// scope "everyone": the message disappears for the contact too (own messages, inside the time limit);
// scope "local": it is only hidden in this system, nothing changes on the phone or for the contact.
const DeleteWhatsAppMessage = async (messageId: string, scope: "everyone" | "local" = "everyone"): Promise<Message> => {
  const message = await loadMessage(messageId);
  const { ticket } = message;

  if (scope === "everyone") {
    if (!message.fromMe) throw new AppError("ERR_DELETE_ONLY_OWN", 400);
    if (Date.now() - new Date(message.createdAt).getTime() > EVERYONE_WINDOW_MS) {
      throw new AppError("ERR_DELETE_TOO_OLD", 400);
    }
    if ((ticket.whatsapp?.channel || "whatsapp") === "whatsapp") {
      await whatsappProvider.deleteMessage(ticket.whatsappId, chatIdOf(ticket.contact, ticket.isGroup), message.id, message.fromMe);
    }
  }

  await message.update({ isDeleted: true });
  return message;
};

export const EditWhatsAppMessage = async (messageId: string, body: string): Promise<Message> => {
  const text = String(body || "").trim();
  if (!text) throw new AppError("ERR_EMPTY_MESSAGE", 400);
  const message = await loadMessage(messageId);
  const { ticket } = message;

  if (!message.fromMe || message.mediaType !== "chat") throw new AppError("ERR_EDIT_NOT_ALLOWED", 400);
  // WhatsApp lets you edit for about fifteen minutes
  if (Date.now() - new Date(message.createdAt).getTime() > 15 * 60 * 1000) throw new AppError("ERR_EDIT_TOO_OLD", 400);
  if ((ticket.whatsapp?.channel || "whatsapp") !== "whatsapp" || !whatsappProvider.editMessage) {
    throw new AppError("ERR_EDIT_NOT_SUPPORTED", 400);
  }

  await whatsappProvider.editMessage(ticket.whatsappId, chatIdOf(ticket.contact, ticket.isGroup), message.id, true, text);
  await message.update({ body: text, isEdited: true });
  return message;
};

export default DeleteWhatsAppMessage;
