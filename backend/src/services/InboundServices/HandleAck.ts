import Message from "../../models/Message";
import Ticket from "../../models/Ticket";
import Tag from "../../models/Tag";
import Whatsapp from "../../models/Whatsapp";
import { getIO } from "../../libs/socket";

export const handleAckByExternalId = async (
  messageId: string,
  ack: number
): Promise<void> => {
  const message = await Message.findByPk(messageId, {
    include: ["contact", { model: Message, as: "quotedMsg", include: ["contact"] }]
  });
  if (!message || message.ack >= ack) return;
  await message.update({ ack });
  const io = getIO();
  io.to(message.ticketId.toString()).emit("appMessage", {
    action: "update",
    message
  });

  // the conversation list shows the ticks of the last message too
  const [changed] = await Ticket.update(
    { lastMessageAck: ack } as any,
    { where: { id: message.ticketId, lastMessageId: message.id }, silent: true } as any
  );
  if (changed) {
    const fresh = await Ticket.findByPk(message.ticketId, {
      include: [
        "contact",
        "queue",
        { model: Tag, as: "tags", attributes: ["id", "name", "color"], through: { attributes: [] } },
        { model: Whatsapp, as: "whatsapp", attributes: ["name", "channel"] }
      ]
    });
    if (fresh) io.to(fresh.status).to(String(fresh.id)).emit("ticket", { action: "update", ticket: fresh });
  }
};

// Meta accepted the message and later said it could not deliver it: the row shows the failure (an ack below the current one, which the
// usual path never writes)
export const handleSendFailure = async (messageId: string): Promise<Message | null> => {
  const message = await Message.findByPk(messageId);
  if (!message) return null;
  await message.update({ ack: -1 });
  getIO().to(message.ticketId.toString()).emit("appMessage", { action: "update", message });
  return message;
};
