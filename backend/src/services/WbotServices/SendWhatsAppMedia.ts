import fs from "fs";
import AppError from "../../errors/AppError";
import Ticket from "../../models/Ticket";
import { whatsappProvider, ProviderMessage } from "../../providers/WhatsApp";

import formatBody from "../../helpers/Mustache";
import Whatsapp from "../../models/Whatsapp";
import { getAdapter } from "../../channels";
import CreateMessageService from "../MessageServices/CreateMessageService";

interface Request {
  media: Express.Multer.File;
  ticket: Ticket;
  body?: string;
}

const SendWhatsAppMedia = async ({
  media,
  ticket,
  body
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
      const sent = await getAdapter(channel).sendMedia(
        whatsapp,
        ticket.contact as any,
        {
          path: media.path,
          filename: media.filename,
          mimetype: media.mimetype
        },
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
          mediaUrl: media.filename,
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

    const chatId = `${ticket.contact.number}@${ticket.isGroup ? "g" : "c"}.us`;

    const hasBody = body
      ? formatBody(body as string, ticket.contact)
      : undefined;

    const mediaInput = {
      filename: media.filename,
      mimetype: media.mimetype,
      path: media.path
    };

    const mediaOptions = {
      caption: hasBody,
      sendAudioAsVoice: true,
      sendMediaAsDocument:
        media.mimetype.startsWith("image/") &&
        !/^.*\.(jpe?g|png|gif)?$/i.exec(media.filename)
    };

    const sentMessage = await whatsappProvider.sendMedia(
      ticket.whatsappId,
      chatId,
      mediaInput,
      mediaOptions
    );

    await ticket.update({ lastMessage: body || media.filename });

    fs.unlinkSync(media.path);

    return sentMessage;
  } catch (err) {
    console.log(err);
    throw new AppError("ERR_SENDING_WAPP_MSG");
  }
};

export default SendWhatsAppMedia;
