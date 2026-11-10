import { bodyOfMedia } from "../../helpers/MediaLabel";
import { insideFolder, safeStoredName } from "../../helpers/SafeFile";
import { isLocalPic } from "../../helpers/PicUrl";
import { join } from "path";
import { writeFile } from "fs";
import { promisify } from "util";
import { Op } from "sequelize";

import Contact from "../../models/Contact";
import Ticket from "../../models/Ticket";
import Message from "../../models/Message";
import Whatsapp from "../../models/Whatsapp";
import { getIO } from "../../libs/socket";
import { logger } from "../../utils/logger";
import CreateMessageService from "../MessageServices/CreateMessageService";
import FindOrCreateTicketService from "../TicketServices/FindOrCreateTicketService";
import RunInboundAutomation from "../AutomationServices/RunInboundAutomation";
import { PUBLIC_DIR } from "../../config/paths";
import processOptOut from "../SafetyServices/OptOut";

const writeFileAsync = promisify(writeFile);

export interface InboundMedia {
  filename?: string;
  mimetype: string;
  data: Buffer;
}

export interface InboundChannelMessage {
  whatsapp: Whatsapp;
  // already prefixed, e.g. "tg_123"
  contactNumber: string;
  contactName: string;
  profilePicUrl?: string;
  messageId: string;
  body: string;
  media?: InboundMedia;
  quotedMsgId?: string;
}

const randomSuffix = (): string =>
  `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

const extensionFor = (mimetype: string): string => {
  const sub = mimetype.split("/")[1] || "bin";
  return sub.split(";")[0].replace("jpeg", "jpg").replace("plain", "txt");
};

export const saveMediaBuffer = async (media: InboundMedia): Promise<string> => {
  // the name comes from the sender: it never decides where the file goes nor what kind of file it is (helpers/SafeFile.ts)
  const filename = safeStoredName(media.filename, media.mimetype);
  await writeFileAsync(
    insideFolder(PUBLIC_DIR, filename),
    media.data
  );
  return filename;
};

export const findOrCreateChannelContact = async (
  whatsapp: Whatsapp,
  number: string,
  name: string,
  profilePicUrl?: string
): Promise<Contact> => {
  let contact = await Contact.findOne({ where: { number } });
  if (contact) {
    const patch: Partial<Contact> = {};
    if (profilePicUrl && !isLocalPic(contact.getDataValue("profilePicUrl")) && profilePicUrl !== contact.profilePicUrl) {
      patch.profilePicUrl = profilePicUrl;
    }
    if (name && contact.name === contact.number) patch.name = name;
    if (Object.keys(patch).length) await contact.update(patch);
  } else {
    contact = await Contact.create({
      name: name || number,
      number,
      profilePicUrl,
      isGroup: false,
      channel: whatsapp.channel
    });
    getIO().emit("contact", { action: "create", contact });
  }
  return contact;
};

const HandleChannelMessage = async (
  input: InboundChannelMessage
): Promise<{ ticket: Ticket; message: Message } | null> => {
  const { whatsapp } = input;
  try {
    const existing = await Message.findByPk(input.messageId);
    if (existing) return null; // duplicate webhook delivery

    const contact = await findOrCreateChannelContact(
      whatsapp,
      input.contactNumber,
      input.contactName,
      input.profilePicUrl
    );

    const open = await Ticket.findOne({
      where: {
        contactId: contact.id,
        whatsappId: whatsapp.id,
        status: { [Op.or]: ["open", "pending"] }
      }
    });
    const unread = (open?.unreadMessages || 0) + 1;

    const ticket = await FindOrCreateTicketService(
      contact,
      whatsapp.id,
      unread
    );

    const messageData: any = {
      id: input.messageId,
      ticketId: ticket.id,
      contactId: contact.id,
      body: input.body,
      fromMe: false,
      read: false,
      mediaType: "chat",
      quotedMsgId: input.quotedMsgId,
      ack: 0
    };

    if (input.media) {
      const filename = await saveMediaBuffer(input.media);
      messageData.mediaUrl = filename;
      messageData.mediaType = input.media.mimetype.split("/")[0];
      // no caption: the list, the toasts and the chat say "📷 Imagem" / "🎤 Áudio" / "🎥 Vídeo" / "Figurinha", never the name of the file
      messageData.body = bodyOfMedia(input.body, messageData.mediaType, filename, filename, input.media.mimetype);
    }

    await ticket.update({ lastMessage: messageData.body });
    const message = await CreateMessageService({ messageData });

    if (!(await processOptOut(ticket.id, input.body))) {
      await RunInboundAutomation({
        ticketId: ticket.id,
        body: input.body
      });
    }

    return { ticket, message };
  } catch (err) {
    logger.error({ info: "Error handling channel message", err });
    return null;
  }
};

export default HandleChannelMessage;
