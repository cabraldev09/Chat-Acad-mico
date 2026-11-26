import { deliver } from "../OutboundServices/Deliver";
import { bodyOfMedia } from "../../helpers/MediaLabel";

import { chatIdOf } from "../../helpers/ChatId";
import fs from "fs";
import path from "path";
import AppError from "../../errors/AppError";
import Ticket from "../../models/Ticket";
import { whatsappProvider, ProviderMessage } from "../../providers/WhatsApp";

import formatBody from "../../helpers/Mustache";
import Whatsapp from "../../models/Whatsapp";
import { getAdapter } from "../../channels";
import CreateMessageService from "../MessageServices/CreateMessageService";
import { paceSend, recordSendResult } from "../SafetyServices/SendGuard";
import { isAudio, toVoiceNote, toMp3 } from "../../helpers/ConvertAudio";
import { logger } from "../../utils/logger";
import { mediaOptionsOf } from "../../helpers/MediaSendOptions";

interface Request {
  media: Express.Multer.File;
  ticket: Ticket;
  body?: string;
  automated?: boolean;
  // the same key twice never sends twice (see SendWhatsAppMessage)
  deliveryKey?: string;
  displayName?: string;
  // how the file goes: a WhatsApp sticker or a GIF (otherwise by its type)
  kind?: "sticker" | "gif";
}

const sendMedia = async ({
  media,
  ticket,
  body,
  automated = false,
  displayName,
  kind
}: Request): Promise<ProviderMessage> => {
  // Once a provider resolves the send, any later database or filesystem error is
  // ambiguous: the media may already be on the recipient's phone.
  let acceptedByProvider = false;
  let providerCallStarted = false;
  try {
    if (!ticket.whatsappId) {
      throw new AppError("ERR_TICKET_NO_WHATSAPP");
    }

    const channel = ticket.whatsapp?.channel || "whatsapp";
    if (channel !== "whatsapp") {
      const whatsapp = await Whatsapp.findByPk(ticket.whatsappId);
      if (!whatsapp) throw new AppError("ERR_NO_WAPP_FOUND", 404);
      const caption = body ? formatBody(body, ticket.contact) : undefined;
      let outgoing = { path: media.path, filename: displayName || media.filename, mimetype: media.mimetype };
      if (isAudio(media.mimetype)) {
        const mp3 = await toMp3(outgoing);
        if (mp3) outgoing = mp3;
      }
      providerCallStarted = true;
      const sent = await getAdapter(channel).sendMedia(
        whatsapp,
        ticket.contact as any,
        outgoing,
        caption
      );
      acceptedByProvider = true;
      // keep a copy in /public so the agent UI can render what was sent
      await CreateMessageService({
        messageData: {
          id: sent.id,
          ticketId: ticket.id,
          body: bodyOfMedia(caption, media.mimetype.split("/")[0], path.basename(outgoing.path), media.originalname || media.filename, media.mimetype),
          fromMe: true,
          read: true,
          mediaType: media.mimetype.split("/")[0],
          mediaUrl: path.basename(outgoing.path),
          ack: 1
        }
      });
      await ticket.update({
        lastMessage: bodyOfMedia(caption, media.mimetype.split("/")[0], path.basename(outgoing.path), media.originalname || media.filename, media.mimetype)
      });
      return {
        id: sent.id,
        body: caption || "",
        fromMe: true,
        hasMedia: true,
        type: "document",
        timestamp: Math.floor(Date.now() / 1000),
        from: "",
        to: ""
      };
    }

    const chatId = chatIdOf(ticket.contact, ticket.isGroup);

    const hasBody = body
      ? formatBody(body as string, ticket.contact)
      : undefined;

    let mediaInput: { filename: string; mimetype: string; path: string; displayName?: string } = {
      filename: media.filename,
      mimetype: media.mimetype,
      path: media.path,
      ...(displayName ? { displayName } : {})
    };
    let asVoice = false;
    let converted: string | null = null;
    if (isAudio(media.mimetype)) {
      const voice = await toVoiceNote(mediaInput);
      if (voice) {
        asVoice = true;
        mediaInput = voice;
        if (voice.path !== media.path) converted = voice.path;
      } else {
        logger.warn("Voice note conversion failed; sending the audio as a file");
      }
    }

    const mediaOptions = {
      caption: kind === "sticker" ? undefined : hasBody,
      sendAudioAsVoice: asVoice,
      ...mediaOptionsOf(media, kind)
    };

    const whatsapp = await Whatsapp.findByPk(ticket.whatsappId);
    if (!whatsapp) throw new AppError("ERR_NO_WAPP_FOUND", 404);
    await paceSend(whatsapp, automated);

    let sentMessage: ProviderMessage;
    try {
      providerCallStarted = true;
      sentMessage = await whatsappProvider.sendMedia(
        ticket.whatsappId,
        chatId,
        mediaInput,
        mediaOptions
      );
      acceptedByProvider = true;
      recordSendResult(whatsapp, true);
    } catch (sendErr) {
      recordSendResult(whatsapp, false);
      throw sendErr;
    }

    await ticket.update({ lastMessage: bodyOfMedia(body, asVoice ? "audio" : media.mimetype.split("/")[0], media.filename, media.originalname || media.filename, media.mimetype) });

    fs.rmSync(media.path, { force: true });
    if (converted) fs.rmSync(converted, { force: true });

    return sentMessage;
  } catch (err) {
    logger.error({ info: "Could not send the media", err: String(err) });
    const knownRefusal = err instanceof AppError && ["ERR_REPLY_WINDOW_CLOSED", "ERR_RATE_LIMITED", "ERR_WAPP_NOT_INITIALIZED", "ERR_PROVIDER_REFUSED"].includes(err.message);
    if (acceptedByProvider || (providerCallStarted && !knownRefusal)) throw new AppError("ERR_DELIVERY_UNCERTAIN", 409);
    // the channel said why (for example the 24 h window of Instagram is closed): the person is told, instead of a generic failure
    if (err instanceof AppError && (knownRefusal || err.message === "ERR_DELIVERY_UNCERTAIN")) throw err;
    throw new AppError("ERR_SENDING_WAPP_MSG");
  }
};

const SendWhatsAppMedia = (input: Request): Promise<ProviderMessage> => deliver(input.ticket, { key: input.deliveryKey, automated: input.automated }, () => sendMedia(input));

export default SendWhatsAppMedia;
