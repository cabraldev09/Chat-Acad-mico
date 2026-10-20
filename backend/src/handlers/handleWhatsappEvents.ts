import { parseVcards, registerAffiliateReferrals } from "../services/AffiliateServices/ReferralFromContact";
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
import { PUBLIC_DIR } from "../config/paths";
import Whatsapp from "../models/Whatsapp";
import Tag from "../models/Tag";
import processOptOut from "../services/SafetyServices/OptOut";
import { MessageType, MessageAck } from "../providers/WhatsApp/types";
import { previewOf } from "../helpers/MessagePreview";

const writeFileAsync = promisify(writeFile);

export interface ContactPayload {
  name: string;
  number: string;
  lid?: string;
  profilePicUrl?: string;
  isGroup: boolean;
  // set for groups when WhatsApp tells they belong to a community
  community?: { kind: "community" | "group"; role?: "parent" | "announcement" | "member"; communityId?: string | null; parentGroupId?: string | null; readOnly?: boolean };
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
  isGif?: boolean;
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

export const saveMediaFile = async (mediaPayload: MediaPayload): Promise<string> => {
  const randomId = makeRandomId(5);
  const { filename: originalFilename } = mediaPayload;

  let filename: string;
  if (!originalFilename) {
    const [extension] = mediaPayload.mimetype.split("/")[1].split(";");
    filename = `${randomId}-${new Date().getTime()}.${extension}`;
  } else {
    const baseName = originalFilename.split(".").slice(0, -1).join(".");
    const extension = originalFilename.split(".").slice(-1)[0];
    // the tilde marks the unique part, so the screen can show the real name of the file without guessing
    filename = `${baseName}~${randomId}.${extension}`;
  }

  try {
    await writeFileAsync(
      join(PUBLIC_DIR, filename),
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
  messagePayload: MessagePayload,
  senderNumber?: string
): Promise<void> => {
  if (messagePayload.type !== "vcard") return;

  try {
    const people = parseVcards(messagePayload.body);
    await Promise.all(
      people.map(({ name, number }) =>
        CreateContactService({ name: name || number, number })
      )
    );
    // a contact shared BY an affiliate is a referral: it goes to the CRM in the affiliate column
    if (senderNumber && !messagePayload.fromMe) {
      await registerAffiliateReferrals(senderNumber, people);
    }
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
  const arrivedAt = Date.now();
  try {
    // groups only become conversations when the connection allows them
    if (contextPayload.groupContact) {
      const wapp = await Whatsapp.findByPk(contextPayload.whatsappId, { attributes: ["groupsMode", "allowedGroups"] });
      const mode = wapp?.groupsMode || "off";
      let allowed: string[] = [];
      try {
        allowed = wapp?.allowedGroups ? JSON.parse(wapp.allowedGroups) : [];
      } catch (e) {
        allowed = [];
      }
      const id = String(contextPayload.groupContact.number);
      if (mode === "off" || (mode === "selected" && !allowed.includes(id))) return;
    }

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
        isGroup: contextPayload.groupContact.isGroup,
        community: contextPayload.groupContact.community
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

    // keep the order the phone shows: a message that reached us late (offline period, history) is stored
    // with the time WhatsApp gave it; live messages keep their arrival time (finer than WhatsApp's seconds)
    const sentAt = Number(processedMessage.timestamp) * 1000;
    const late = sentAt > 0 && Math.abs(Date.now() - sentAt) > 5000;

    const messageData: any = {
      ...(late ? { createdAt: new Date(sentAt) } : {}),
      id: processedMessage.id,
      ticketId: ticket.id,
      contactId: processedMessage.fromMe ? undefined : contact.id,
      body: processedMessage.body,
      fromMe: processedMessage.fromMe,
      read: processedMessage.fromMe,
      mediaType: ["image", "video", "audio", "ptt", "document", "sticker"].includes(processedMessage.type)
        ? (processedMessage.type === "ptt" ? "audio" : processedMessage.type === "sticker" ? "image" : processedMessage.type)
        : processedMessage.type,
      isGif: !!processedMessage.isGif,
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

    await ticket.update({ lastMessage: previewOf(lastMessageText, processedMessage.type) });

    await CreateMessageService({ messageData });

    await processVcardMessage(processedMessage, contextPayload.groupContact ? undefined : contact.number);

    // where a delay is born: WhatsApp (the connection received it late) or here (it took long to store)
    {
      const wppLag = arrivedAt - Number(processedMessage.timestamp) * 1000;
      const stored = Date.now() - arrivedAt;
      if (!processedMessage.fromMe && (wppLag > 4000 || stored > 2000)) {
        logger.info(`Mensagem do ticket ${ticket.id}: chegou ${Math.round(wppLag / 100) / 10} s depois de enviada pelo WhatsApp; gravada em ${stored} ms`);
      }
    }

    if (!contextPayload.groupContact && !processedMessage.fromMe) {
      const optedOut = await processOptOut(ticket.id, processedMessage.body);
      if (!optedOut && !ticket.userId) {
        await RunInboundAutomation({
          ticketId: ticket.id,
          body: processedMessage.body
        });
      } else {
        logger.info(`Automação do ticket ${ticket.id}: não rodou (${optedOut ? "a pessoa pediu para não receber mensagens" : `a conversa está com o atendente ${ticket.userId}`})`);
      }
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
    const include = [
      "contact",
      {
        model: Message,
        as: "quotedMsg",
        include: ["contact"]
      }
    ];
    let messageToUpdate = await Message.findByPk(messageId, { include });

    // the ack can beat the row that is still being saved (contact lookup, media download)
    for (let i = 0; !messageToUpdate && i < 3; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise(r => setTimeout(r, 500));
      // eslint-disable-next-line no-await-in-loop
      messageToUpdate = await Message.findByPk(messageId, { include });
    }

    if (!messageToUpdate) {
      return;
    }

    // ticks only go forward (sent -> delivered -> read); -1 is a failure and always applies
    if (ack >= 0 && (messageToUpdate.ack || 0) >= ack) {
      return;
    }

    await messageToUpdate.update({ ack });

    // when it is the message shown in the conversation list, the list gets the new ticks too
    const [changed] = await Ticket.update(
      { lastMessageAck: ack } as any,
      { where: { id: messageToUpdate.ticketId, lastMessageId: messageToUpdate.id }, silent: true } as any
    );
    if (changed) {
      const fresh = await Ticket.findByPk(messageToUpdate.ticketId, {
        include: [
          "contact",
          "queue",
          { model: Tag, as: "tags", attributes: ["id", "name", "color"], through: { attributes: [] } },
          { model: Whatsapp, as: "whatsapp", attributes: ["name", "channel"] }
        ]
      });
      if (fresh) io.to(fresh.status).to(String(fresh.id)).emit("ticket", { action: "update", ticket: fresh });
    }

    io.to(messageToUpdate.ticketId.toString()).emit("appMessage", {
      action: "update",
      message: messageToUpdate
    });
  } catch (err) {
    Sentry.captureException(err);
    logger.error(`Error handling message ack: ${err}`);
  }
};
