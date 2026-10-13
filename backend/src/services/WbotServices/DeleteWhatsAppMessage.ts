import AppError from "../../errors/AppError";
import Message from "../../models/Message";
import Ticket from "../../models/Ticket";
import Whatsapp from "../../models/Whatsapp";
import { whatsappProvider } from "../../providers/WhatsApp";

const DeleteWhatsAppMessage = async (messageId: string): Promise<Message> => {
  const message = await Message.findByPk(messageId, {
    include: [
      {
        model: Ticket,
        as: "ticket",
        include: [
          "contact",
          { model: Whatsapp, as: "whatsapp", attributes: ["channel"] }
        ]
      }
    ]
  });

  if (!message) {
    throw new AppError("No message found with this ID.");
  }

  const { ticket } = message;

  if ((ticket.whatsapp?.channel || "whatsapp") === "whatsapp") {
    const chatId = `${ticket.contact.number}@${ticket.isGroup ? "g" : "c"}.us`;

    await whatsappProvider.deleteMessage(
      ticket.whatsappId,
      chatId,
      message.id,
      message.fromMe
    );
  }

  await message.update({ isDeleted: true });

  return message;
};

export default DeleteWhatsAppMessage;
