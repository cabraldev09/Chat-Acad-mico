import Message from "../../models/Message";
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
  getIO().to(message.ticketId.toString()).emit("appMessage", {
    action: "update",
    message
  });
};
