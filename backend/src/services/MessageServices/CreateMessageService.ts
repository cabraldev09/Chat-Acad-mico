import { Op } from "sequelize";
import { getIO } from "../../libs/socket";
import Message from "../../models/Message";
import Ticket from "../../models/Ticket";
import Whatsapp from "../../models/Whatsapp";
import Tag from "../../models/Tag";
import dispatchWebhook from "../WebhookServices/DispatchWebhook";
import { hookInbound, hookHumanReply } from "../CrmServices/LeadCore";
import { captureNpsAnswer } from "../CrmServices/Nps";
import { captureTeamReply } from "../AiServices/Learning";

interface MessageData {
  id: string;
  ticketId: number;
  body: string;
  contactId?: number;
  fromMe?: boolean;
  read?: boolean;
  mediaType?: string;
  mediaUrl?: string;
  ack?: number;
  quotedMsgId?: string;
  createdAt?: Date;
}
interface Request {
  messageData: MessageData;
}

const CreateMessageService = async ({
  messageData
}: Request): Promise<Message> => {
  // the same message is processed more than once (media upload + create); a later pass must not lower the ticks
  // (a message the system stores right after sending, and then again when the connection reports it, is the same message: the second pass changes the screens, not the counters, lessons and webhooks)
  let already = false;
  if (messageData.id) {
    const current = await Message.findByPk(messageData.id, { attributes: ["id", "ack"] });
    already = !!current;
    if (current && (current.ack || 0) > (messageData.ack || 0)) {
      messageData.ack = current.ack;
    }
  }
  await Message.upsert(messageData);

  const message = await Message.findByPk(messageData.id, {
    include: [
      "contact",
      {
        model: Ticket,
        as: "ticket",
        include: [
          "contact",
          "queue",
          {
            model: Tag,
            as: "tags",
            attributes: ["id", "name", "color"],
            through: { attributes: [] }
          },
          {
            model: Whatsapp,
            as: "whatsapp",
            attributes: ["name", "channel"]
          }
        ]
      },
      {
        model: Message,
        as: "quotedMsg",
        include: ["contact"]
      }
    ]
  });

  if (!message) {
    throw new Error("ERR_CREATING_MESSAGE");
  }

  if (
    message.fromMe &&
    message.ticket.userId &&
    !message.ticket.firstResponseAt
  ) {
    await message.ticket.update({ firstResponseAt: new Date() });
  }

  // the list shows this message (and later its ticks) under the contact's name
  const lastState = {
    lastMessageId: message.id,
    lastMessageFromMe: !!message.fromMe,
    // a sticker travels as a .webp image: the list says "Figurinha", not "Foto"
    lastMessageType: message.mediaType === "image" && /\.webp(\?|$)/i.test(message.mediaUrl || "") ? "sticker" : message.mediaType || "chat",
    lastMessageAt: message.createdAt || new Date(),
    lastMessageAuthor: message.ticket.isGroup && !message.fromMe ? (message.contact?.name || null) : null
  };
  // only a message newer than the one shown becomes "the last": one that arrives late (catch-up, history) never takes a chat back in time
  const at = lastState.lastMessageAt as Date;
  const [newest] = await Ticket.update(
    { ...lastState, lastMessageAck: message.ack || 0 } as any,
    { where: { id: message.ticketId, [Op.or]: [{ lastMessageAt: null }, { lastMessageAt: { [Op.lte]: at } }, { lastMessageId: message.id }] }, silent: true } as any
  );
  // the event below carries this ticket to the list, so it must already hold the new last message
  if (newest) {
    message.ticket.set(
      { ...lastState, lastMessageAck: message.ack || 0 } as any,
      { raw: true } as any
    );
  }

  // what the team answers after the AI handed a question over becomes a lesson for the owner to review
  if (!already && message.fromMe && message.ticket.userId && !message.ticket.isGroup && message.mediaType === "chat") {
    captureTeamReply(message.ticket, message.body).catch(() => undefined);
  }

  // a message from the contact brings an archived conversation back to the inbox
  if (!message.fromMe && message.ticket.archivedAt) {
    await message.ticket.update({ archivedAt: null });
  }

  if (!message.ticket.isGroup) {
    if (!message.fromMe) {
      hookInbound(message.ticket.contactId, message.ticket.whatsapp?.channel);
      // a bare number from 0 to 10 answers the satisfaction survey that was sent to this person
      if (message.mediaType === "chat") captureNpsAnswer(message.ticket.contactId, message.body, message.ticket.whatsappId).catch(() => undefined);
    } else if (message.ticket.userId && !already) {
      hookHumanReply(message.ticket.contactId, message.ticket.userId);
    }
  }

  // the screens hear about the message first: nobody waits for the webhook queue to see what arrived
  const io = getIO();
  io.to(message.ticketId.toString())
    .to(message.ticket.status)
    .to("notification")
    .emit("appMessage", {
      action: "create",
      message,
      ticket: message.ticket,
      contact: message.ticket.contact
    });

  if (already && message.fromMe) return message;
  dispatchWebhook(message.fromMe ? "message.sent" : "message.received", {
    messageId: message.id,
    ticketId: message.ticketId,
    body: message.body,
    mediaType: message.mediaType,
    mediaUrl: message.mediaUrl,
    fromMe: message.fromMe,
    contact: message.ticket.contact && {
      id: message.ticket.contact.id,
      name: message.ticket.contact.name,
      number: message.ticket.contact.number
    },
    channel: message.ticket.whatsapp?.channel
  }).catch(() => undefined);

  return message;
};

export default CreateMessageService;
