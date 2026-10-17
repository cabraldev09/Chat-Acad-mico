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
  if (messageData.id) {
    const current = await Message.findByPk(messageData.id, { attributes: ["id", "ack"] });
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
    lastMessageType: message.mediaType || "chat",
    lastMessageAt: message.createdAt || new Date(),
    lastMessageAuthor: message.ticket.isGroup && !message.fromMe ? (message.contact?.name || null) : null
  };
  await Ticket.update(
    { ...lastState, lastMessageAck: message.ack || 0 } as any,
    { where: { id: message.ticketId }, silent: true } as any
  );
  // the event below carries this ticket to the list, so it must already hold the new last message
  message.ticket.set(
    { ...lastState, lastMessageAck: message.ack || 0 } as any,
    { raw: true } as any
  );

  // what the team answers after the AI handed a question over becomes a lesson for the owner to review
  if (message.fromMe && message.ticket.userId && !message.ticket.isGroup && message.mediaType === "chat") {
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
      if (message.mediaType === "chat") captureNpsAnswer(message.ticket.contactId, message.body).catch(() => undefined);
    } else if (message.ticket.userId) {
      hookHumanReply(message.ticket.contactId, message.ticket.userId);
    }
  }

  await dispatchWebhook(message.fromMe ? "message.sent" : "message.received", {
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
  });

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

  return message;
};

export default CreateMessageService;
