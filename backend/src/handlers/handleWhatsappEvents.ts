import { join } from "path";
import { promisify } from "util";
import { writeFile } from "fs";
import * as Sentry from "@sentry/node";

import { getIO } from "../libs/socket";
import { logger } from "../utils/logger";
import formatBody from "../helpers/Mustache";

import Contact from "../models/Contact";
import Ticket from "../models/Ticket";
import Message from "../models/Message";

import CreateMessageService from "../services/MessageServices/CreateMessageService";
import CreateOrUpdateContactService from "../services/ContactServices/CreateOrUpdateContactService";
import FindOrCreateTicketService from "../services/TicketServices/FindOrCreateTicketService";
import ShowWhatsAppService from "../services/WhatsappService/ShowWhatsAppService";
import CreateContactService from "../services/ContactServices/CreateContactService";

import RunInboundAutomation from "../services/AutomationServices/RunInboundAutomation";
import { MessageType, MessageAck } from "../providers/WhatsApp/types";

const writeFileAsync = promisify(writeFile);

export interface ContactPayload {
  name: string;
  number: string;
  lid?: string;
  profilePicUrl?: string;
  isGroup: boolean;
}

export interface MessagePayload {
  id: string;
  body: string;
  fromMe: boolean;
  hasMedia: boolean;
  type: MessageType;
  timestamp: number;
  from: string;
  to: string;
  hasQuotedMsg?: boolean;
  quotedMsgId?: string;
  mediaUrl?: string;
  mediaType?: string;
  ack?: MessageAck;
}

export interface MediaPayload {
  filename: string;
  mimetype: string;
  data: string;
}

export interface WhatsappContextPayload {
  whatsappId: number;
  unreadMessages: number;
  groupContact?: ContactPayload;
}

const makeRandomId = (length: number): string => {
  let result = "";
  const characters =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const charactersLength = characters.length;
  let counter = 0;
  while (counter < length) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
    counter += 1;
  }
  return result;
};

const processLocationMessage = (
  messagePayload: MessagePayload
): MessagePayload => {
  if (messagePayload.type !== "location") return messagePayload;

  return messagePayload;
};

const saveMediaFile = async (mediaPayload: MediaPayload): Promise<string> => {
  const randomId = makeRandomId(5);
  const { filename: originalFilename } = mediaPayload;

  let filename: string;
  if (!originalFilename) {
    const [extension] = mediaPayload.mimetype.split("/")[1].split(";");
    filename = `${randomId}-${new Date().getTime()}.${extension}`;
  } else {
    const baseName = originalFilename.split(".").slice(0, -1).join(".");
    const extension = originalFilename.split(".").slice(-1)[0];
    filename = `${baseName}.${randomId}.${extension}`;
  }

  try {
    await writeFileAsync(
      join(__dirname, "..", "..", "public", filename),
      mediaPayload.data,
      "base64"
    );
  } catch (err) {
    Sentry.captureException(err);
    logger.error(err);
  }

  return filename;
};

const processVcardMessage = async (
  messagePayload: MessagePayload
): Promise<void> => {
  if (messagePayload.type !== "vcard") return;

  try {
    const array = messagePayload.body.split("\n");
    const phoneNumbers: Array<{ number: string }> = [];
    let contactName = "";

    array.forEach(line => {
      const values = line.split(":");
      values.forEach((value, index) => {
        if (value.indexOf("+") !== -1) {
          phoneNumbers.push({ number: value });
        }
        if (value.indexOf("FN") !== -1 && values[index + 1]) {
          contactName = values[index + 1];
        }
      });
    });

    await Promise.all(
      phoneNumbers.map(({ number }) =>
        CreateContactService({
          name: contactName,
          number: number.replace(/\D/g, "")
        })
      )
    );
  } catch (error) {
    logger.error("Error processing vcard message:", error);
  }
};

export const handleMessage = async (
  messagePayload: MessagePayload,
  contactPayload: ContactPayload,
  contextPayload: WhatsappContextPayload,
  mediaPayload?: MediaPayload
): Promise<void> => {
  try {
    const processedMessage = processLocationMessage(messagePayload);

    const contact = await CreateOrUpdateContactService({
      name: contactPayload.name,
      number: contactPayload.number,
      lid: contactPayload.lid,
      profilePicUrl: contactPayload.profilePicUrl,
      isGroup: contactPayload.isGroup
    });

    let groupContact: Contact | undefined;
    if (contextPayload.groupContact) {
      groupContact = await CreateOrUpdateContactService({
        name: contextPayload.groupContact.name,
        number: contextPayload.groupContact.number,
        lid: contextPayload.groupContact.lid,
        profilePicUrl: contextPayload.groupContact.profilePicUrl,
        isGroup: contextPayload.groupContact.isGroup
      });
    }

    const whatsapp = await ShowWhatsAppService(contextPayload.whatsappId);
    if (
      contextPayload.unreadMessages === 0 &&
      whatsapp.farewellMessage &&
      formatBody(whatsapp.farewellMessage, contact) === processedMessage.body
    ) {
      return;
    }

    const ticket = await FindOrCreateTicketService(
      contact,
      contextPayload.whatsappId,
      contextPayload.unreadMessages,
      groupContact
    );

    const messageData: any = {
      id: processedMessage.id,
      ticketId: ticket.id,
      contactId: processedMessage.fromMe ? undefined : contact.id,
      body: processedMessage.body,
      fromMe: processedMessage.fromMe,
      read: processedMessage.fromMe,
      mediaType: processedMessage.type,
      quotedMsgId: processedMessage.quotedMsgId,
      ack: processedMessage.ack !== undefined ? processedMessage.ack : 0
    };

    if (mediaPayload && processedMessage.hasMedia) {
      const filename = await saveMediaFile(mediaPayload);
      messageData.mediaUrl = filename;
      messageData.body = processedMessage.body || filename;
      const [mediaType] = mediaPayload.mimetype.split("/");
      messageData.mediaType = mediaType;
    }

    let lastMessageText = "";
    if (processedMessage.type === "location") {
      lastMessageText = processedMessage.body.includes("Localization")
        ? processedMessage.body
        : "Localization";
    } else {
      lastMessageText = processedMessage.body || mediaPayload?.filename || "";
    }

    await ticket.update({ lastMessage: lastMessageText });

    await CreateMessageService({ messageData });

    await processVcardMessage(processedMessage);

    if (!contextPayload.groupContact && !processedMessage.fromMe && !ticket.userId) {
      await RunInboundAutomation({
        ticketId: ticket.id,
        body: processedMessage.body
      });
    }
  } catch (err) {
    Sentry.captureException(err);
    logger.error({
      info: "Error handling message",
      err,
      messagePayload,
      contactPayload,
      contextPayload,
      mediaPayload
    });
  }
};

export const handleMessageAck = async (
  messageId: string,
  ack: MessageAck
): Promise<void> => {
  await new Promise(r => setTimeout(r, 500));

  const io = getIO();

  try {
    const messageToUpdate = await Message.findByPk(messageId, {
      include: [
        "contact",
        {
          model: Message,
          as: "quotedMsg",
          include: ["contact"]
        }
      ]
    });

    if (!messageToUpdate) {
      return;
    }

    await messageToUpdate.update({ ack });

    io.to(messageToUpdate.ticketId.toString()).emit("appMessage", {
      action: "update",
      message: messageToUpdate
    });
  } catch (err) {
    Sentry.captureException(err);
    logger.error(`Error handling message ack: ${err}`);
  }
};
