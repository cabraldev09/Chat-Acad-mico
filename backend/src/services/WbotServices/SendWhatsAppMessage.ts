import { chatIdOf } from "../../helpers/ChatId";
import { previewOf } from "../../helpers/MessagePreview";
import AppError from "../../errors/AppError";
import Message from "../../models/Message";
import Ticket from "../../models/Ticket";
import { whatsappProvider, ProviderMessage } from "../../providers/WhatsApp";

import formatBody from "../../helpers/Mustache";
import Whatsapp from "../../models/Whatsapp";
import { getAdapter } from "../../channels";
import CreateMessageService from "../MessageServices/CreateMessageService";
import {
  isUnofficial,
  paceSend,
  recordSendResult,
  typingDelay
} from "../SafetyServices/SendGuard";

interface Request {
  body: string;
  ticket: Ticket;
  quotedMsg?: Message;
  // sent by a bot/campaign (not typed by a person): gets "typing…" and a delay
  automated?: boolean;
}

const SendWhatsAppMessage = async ({
  body,
  ticket,
  quotedMsg,
  automated = false
}: Request): Promise<ProviderMessage> => {
  if (!ticket.whatsappId) {
    throw new AppError("ERR_TICKET_NO_WHATSAPP");
  }

  const channel = ticket.whatsapp?.channel || "whatsapp";
  if (channel !== "whatsapp") {
    const whatsapp = await Whatsapp.findByPk(ticket.whatsappId);
    if (!whatsapp) throw new AppError("ERR_NO_WAPP_FOUND", 404);
    const text = formatBody(body, ticket.contact);
    try {
      const sent = await getAdapter(channel).sendText(
        whatsapp,
        ticket.contact as any,
        text
      );
      await CreateMessageService({
        messageData: {
          id: sent.id,
          ticketId: ticket.id,
          body: text,
          fromMe: true,
          read: true,
          mediaType: "chat",
          ack: 1,
          quotedMsgId: quotedMsg?.id
        }
      });
      await ticket.update({ lastMessage: previewOf(text) });
      return {
        id: sent.id,
        body: text,
        fromMe: true,
        hasMedia: false,
        type: "chat",
        timestamp: Math.floor(Date.now() / 1000),
        from: "",
        to: ""
      };
    } catch (err) {
      throw new AppError("ERR_SENDING_WAPP_MSG");
    }
  }

  const chatId = chatIdOf(ticket.contact, ticket.isGroup);

  const whatsapp = await Whatsapp.findByPk(ticket.whatsappId);
  if (!whatsapp) throw new AppError("ERR_NO_WAPP_FOUND", 404);
  const text = formatBody(body, ticket.contact);

  // unofficial connection: never reply like a machine
  if (automated && isUnofficial(whatsapp)) {
    await whatsappProvider.sendTyping?.(ticket.whatsappId, chatId);
    await new Promise(r => setTimeout(r, typingDelay(text)));
  }
  await paceSend(whatsapp, automated);

  try {
    const sentMessage = await whatsappProvider.sendMessage(
      ticket.whatsappId,
      chatId,
      text,
      {
        quotedMessageId: quotedMsg?.id,
        quotedMessageFromMe: quotedMsg?.fromMe,
        linkPreview: false
      }
    );

    recordSendResult(whatsapp, true);
    await ticket.update({ lastMessage: previewOf(body) });
    return sentMessage;
  } catch (err) {
    recordSendResult(whatsapp, false);
    throw new AppError("ERR_SENDING_WAPP_MSG");
  }
};

export default SendWhatsAppMessage;
