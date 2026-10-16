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

interface Request {
  media: Express.Multer.File;
  ticket: Ticket;
  body?: string;
  automated?: boolean;
  displayName?: string;
}

const SendWhatsAppMedia = async ({
  media,
  ticket,
  body,
  automated = false,
  displayName
}: Request): Promise<ProviderMessage> => {
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
      const sent = await getAdapter(channel).sendMedia(
        whatsapp,
        ticket.contact as any,
        outgoing,
        caption
      );
      // keep a copy in /public so the agent UI can render what was sent
      await CreateMessageService({
        messageData: {
          id: sent.id,
          ticketId: ticket.id,
          body: caption || media.originalname || media.filename,
          fromMe: true,
          read: true,
          mediaType: media.mimetype.split("/")[0],
          mediaUrl: path.basename(outgoing.path),
          ack: 1
        }
      });
      await ticket.update({
        lastMessage: caption || media.originalname || media.filename
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
      caption: hasBody,
      sendAudioAsVoice: asVoice,
      sendMediaAsDocument:
        media.mimetype.startsWith("image/") &&
        !/^.*\.(jpe?g|png|gif)?$/i.exec(media.filename)
    };

    const whatsapp = await Whatsapp.findByPk(ticket.whatsappId);
    if (!whatsapp) throw new AppError("ERR_NO_WAPP_FOUND", 404);
    await paceSend(whatsapp, automated);

    let sentMessage: ProviderMessage;
    try {
      sentMessage = await whatsappProvider.sendMedia(
        ticket.whatsappId,
        chatId,
        mediaInput,
        mediaOptions
      );
      recordSendResult(whatsapp, true);
    } catch (sendErr) {
      recordSendResult(whatsapp, false);
      throw sendErr;
    }

    await ticket.update({ lastMessage: body || (asVoice ? "Mensagem de voz" : media.filename) });

    fs.rmSync(media.path, { force: true });
    if (converted) fs.rmSync(converted, { force: true });

    return sentMessage;
  } catch (err) {
    logger.error({ info: "Could not send the media", err: String(err) });
    throw new AppError("ERR_SENDING_WAPP_MSG");
  }
};

export default SendWhatsAppMedia;
