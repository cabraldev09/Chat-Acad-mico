import { fire } from "../../helpers/Fire";
import { chatIdOf } from "../../helpers/ChatId";
import { previewOf } from "../../helpers/MessagePreview";
import { limitEmojis } from "../../helpers/Emoji";
import { emitTyping } from "./ChatState";
import AppError from "../../errors/AppError";
import Message from "../../models/Message";
import Ticket from "../../models/Ticket";
import { whatsappProvider, ProviderMessage } from "../../providers/WhatsApp";

import formatBody from "../../helpers/Mustache";
import Whatsapp from "../../models/Whatsapp";
import { logger } from "../../utils/logger";
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
  // a question with options: channels that have buttons send them natively (the text stays in the history)
  choices?: { question: string; options: Array<{ id: string; label: string }> };
}

const SendWhatsAppMessage = async ({
  body,
  ticket,
  quotedMsg,
  automated = false,
  choices
}: Request): Promise<ProviderMessage> => {
  if (!ticket.whatsappId) {
    throw new AppError("ERR_TICKET_NO_WHATSAPP");
  }

  const channel = ticket.whatsapp?.channel || "whatsapp";
  if (channel !== "whatsapp") {
    const whatsapp = await Whatsapp.findByPk(ticket.whatsappId);
    if (!whatsapp) throw new AppError("ERR_NO_WAPP_FOUND", 404);
    const text = automated ? limitEmojis(formatBody(body, ticket.contact), 1) : formatBody(body, ticket.contact);
    try {
      const adapter = getAdapter(channel);
      const sent =
        choices && choices.options.length && adapter.sendChoices
          ? await adapter.sendChoices(whatsapp, ticket.contact as any, choices.question, choices.options)
          : await adapter.sendText(whatsapp, ticket.contact as any, text);
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
      if (!automated) fire("message.agent_sent", { ticketId: ticket.id, contactId: ticket.contactId });
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
  const text = automated ? limitEmojis(formatBody(body, ticket.contact), 1) : formatBody(body, ticket.contact);

  const t0 = Date.now();
  let typedMs = 0;
  // unofficial connection: never reply like a machine
  if (automated && isUnofficial(whatsapp)) {
    await whatsappProvider.sendTyping?.(ticket.whatsappId, chatId);
    // the team sees the robot "typing…" too, for as long as the lead sees it
    const typingMs = typingDelay(text);
    emitTyping(ticket.id, "agent", "typing", typingMs + 2000);
    await new Promise(r => setTimeout(r, typingMs));
    typedMs = Date.now() - t0;
  }
  const t1 = Date.now();
  await paceSend(whatsapp, automated);
  const paceMs = Date.now() - t1;

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
    if (automated) {
      emitTyping(ticket.id, "agent", "idle", 0);
      const total = Date.now() - t0;
      if (total > 4000) logger.info(`Envio automático do ticket ${ticket.id}: ${total} ms no total (digitando ${typedMs} ms, ritmo de envio ${paceMs} ms, WhatsApp ${total - typedMs - paceMs} ms)`);
    }
    await ticket.update({ lastMessage: previewOf(body) });
    // The message is stored here, right after WhatsApp accepted it, so it shows in the open conversation at once (the connection's own report of it
    // comes later, through a slower path). The listener skips what starts with the robots' invisible mark, so for those this is the only copy.
    // Saving twice is harmless (same id).
    {
      try {
        await CreateMessageService({
          messageData: { id: sentMessage.id, ticketId: ticket.id, body: text, fromMe: true, read: true, mediaType: "chat", ack: sentMessage.ack || 0, quotedMsgId: quotedMsg?.id }
        });
      } catch (err) {
        logger.error({ ticketId: ticket.id, err: String((err as any)?.message || err) }, "A mensagem do robô foi enviada, mas não foi gravada na conversa");
      }
    }
    if (!automated) fire("message.agent_sent", { ticketId: ticket.id, contactId: ticket.contactId });
    return sentMessage;
  } catch (err) {
    recordSendResult(whatsapp, false);
    logger.error({ ticketId: ticket.id, whatsappId: whatsapp.id, chatId, err: String((err as any)?.message || err) }, "WhatsApp send failed");
    throw new AppError("ERR_SENDING_WAPP_MSG");
  }
};

export default SendWhatsAppMessage;
