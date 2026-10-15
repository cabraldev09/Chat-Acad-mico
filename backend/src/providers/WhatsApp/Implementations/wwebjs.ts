import { syncChatRead } from "../../../services/MessageServices/SyncReadState";
import qrCode from "qrcode-terminal";
import {
  Client,
  LocalAuth,
  MessageMedia,
  Message as WbotMessage,
  Contact as WbotContact,
  MessageSendOptions
} from "whatsapp-web.js";
import { Poll } from "whatsapp-web.js";
import { applyReaction } from "../../../services/MessageServices/MessageActions";
import { WWEBJS_AUTH_DIR } from "../../../config/paths";
import fs from "fs";
import path from "path";
import { onDisconnected } from "../../../services/SafetyServices/SendGuard";
import { getIO } from "../../../libs/socket";
import Whatsapp from "../../../models/Whatsapp";
import AppError from "../../../errors/AppError";
import SaveImportedContacts from "../../../helpers/SaveImportedContacts";
import { isPhoneNumber } from "../../../helpers/ChatId";
import User from "../../../models/User";
import Contact from "../../../models/Contact";
import Message from "../../../models/Message";
import Ticket from "../../../models/Ticket";
import { Op } from "sequelize";
import { logger } from "../../../utils/logger";
import { WhatsappProvider } from "../whatsappProvider";
import {
  ProviderMessage,
  ProviderMediaInput,
  SendMessageOptions,
  SendMediaOptions,
  MessageType,
  ProviderHistoryChat,
  HistoryOptions,
  MessageAck,
  ProviderContact
} from "../types";
import {
  handleMessage,
  handleMessageAck,
  ContactPayload,
  MessagePayload,
  MediaPayload,
  WhatsappContextPayload
} from "../../../handlers/handleWhatsappEvents";

interface Session extends Client {
  id?: number;
}

const sessions: Session[] = [];

const getWbot = (whatsappId: number): Session => {
  const sessionIndex = sessions.findIndex(s => s.id === whatsappId);

  if (sessionIndex === -1) {
    throw new AppError("ERR_WAPP_NOT_INITIALIZED");
  }
  return sessions[sessionIndex];
};

const mapMessageType = (wbotType: any): MessageType => {
  const typeMap: Record<string, MessageType> = {
    chat: "chat",
    audio: "audio",
    ptt: "ptt",
    video: "video",
    image: "image",
    document: "document",
    vcard: "vcard",
    sticker: "sticker",
    location: "location"
  };
  return typeMap[wbotType] || "chat";
};

const mapMessageAck = (wbotAck: any): MessageAck => {
  const ackMap: Record<number, MessageAck> = {
    "-1": -1,
    0: 0,
    1: 1,
    2: 2,
    3: 3,
    4: 4
  };
  return ackMap[wbotAck] ?? 0;
};

const convertToProviderMessage = (
  wbotMessage: WbotMessage
): ProviderMessage => {
  return {
    id: wbotMessage.id.id,
    body: wbotMessage.body,
    fromMe: wbotMessage.fromMe,
    hasMedia: wbotMessage.hasMedia,
    type: mapMessageType(wbotMessage.type),
    timestamp: wbotMessage.timestamp,
    from: wbotMessage.from,
    to: wbotMessage.to,
    hasQuotedMsg: wbotMessage.hasQuotedMsg,
    ack: mapMessageAck(wbotMessage.ack)
  };
};

const getSerializedMessageId = (
  chatId: string,
  fromMe: boolean,
  messageId: string
): string => {
  const serializedMsgId = `${fromMe}_${chatId}_${messageId}`;

  return serializedMsgId;
};

// Fetching the profile picture is a round trip to WhatsApp for every message, which made incoming messages
// slow to show up. Pictures are cached for a few hours and a slow answer never holds the message back.
const PIC_TTL_MS = 6 * 60 * 60 * 1000;
const picCache = new Map<string, { url?: string; at: number }>();

const getProfilePic = async (
  msgContact: WbotContact
): Promise<string | undefined> => {
  const key = msgContact.id._serialized;
  const hit = picCache.get(key);
  if (hit && Date.now() - hit.at < PIC_TTL_MS) return hit.url;

  try {
    const url = await Promise.race([
      msgContact.getProfilePicUrl(),
      new Promise<undefined>(resolve => setTimeout(resolve, 1500))
    ]);
    if (url !== undefined) {
      picCache.set(key, { url: url || undefined, at: Date.now() });
    }
    return url || undefined;
  } catch (err) {
    return undefined;
  }
};

// Many people are now known to WhatsApp only by an internal id ("...@lid"), which looks like a phone number
// but is not one. The real phone is looked up (and remembered) so contacts keep their true number.
const phoneOfLid = new Map<string, string>();
const onlyDigits = (value?: string): string => String(value || "").split("@")[0].replace(/\D/g, "");

const resolvePhones = async (
  wbot: Session,
  serializedIds: string[]
): Promise<Map<string, string>> => {
  const out = new Map<string, string>();
  const todo: string[] = [];
  serializedIds.forEach(id => {
    if (phoneOfLid.has(id)) out.set(id, phoneOfLid.get(id) as string);
    else todo.push(id);
  });
  for (let i = 0; i < todo.length; i += 50) {
    const batch = todo.slice(i, i + 50);
    try {
      // eslint-disable-next-line no-await-in-loop
      const found = await (wbot as any).getContactLidAndPhone(batch);
      batch.forEach((id, k) => {
        const digits = onlyDigits(found?.[k]?.pn);
        const phone = isPhoneNumber(digits) ? digits : "";
        phoneOfLid.set(id, phone);
        out.set(id, phone);
      });
    } catch (err) {
      batch.forEach(id => out.set(id, ""));
    }
  }
  return out;
};

const convertToContactPayload = async (
  msgContact: WbotContact,
  wbot: Session
): Promise<ContactPayload> => {
  const profilePicUrl = await getProfilePic(msgContact);
  const isLid = msgContact.id.server === "lid";

  if (isLid) {
    const phone =
      (await resolvePhones(wbot, [msgContact.id._serialized])).get(
        msgContact.id._serialized
      ) || "";
    return {
      name:
        msgContact.name ||
        msgContact.pushname ||
        phone ||
        "Contato sem telefone",
      number: phone,
      lid: msgContact.id.user,
      profilePicUrl,
      isGroup: false
    };
  }

  return {
    name: msgContact.name || msgContact.pushname || msgContact.id.user,
    number: msgContact.id.user,
    profilePicUrl,
    isGroup: msgContact.isGroup
  };
};

// Is this group a WhatsApp Community (or the announcement group of one), or a sub-group of one? WhatsApp Web keeps this in
// the group metadata; the field names changed between versions, so every known spelling is read and anything missing
// simply means "ordinary group". It never throws: a group that cannot be classified stays a group.
const communityOf = (chat: any, wbot: any): ContactPayload["community"] => {
  try {
    const md = chat?.groupMetadata || {};
    const type = String(md.groupType || md.type || "").toUpperCase();
    const parent = md.parentGroupId?._serialized || md.parentGroup?._serialized || md.parent?._serialized || null;
    const isParent = md.isParentGroup === true || md.isCommunity === true || type === "COMMUNITY" || type === "PARENT";
    const isAnnouncement = md.isCommunityAnnounce === true || md.isDefaultSubgroup === true || md.defaultSubgroup === true || type === "DEFAULT_SUBGROUP" || type === "COMMUNITY_ANNOUNCEMENT" || type === "LINKED_ANNOUNCEMENT_GROUP";
    const meId = wbot?.info?.wid?._serialized;
    const me = (chat.participants || []).find((p: any) => p.id?._serialized === meId);
    const adminsOnly = md.announce === true || chat.isReadOnly === true;
    if (isParent || isAnnouncement) {
      return { kind: "community", parentGroupId: parent, readOnly: adminsOnly && !(me && (me.isAdmin || me.isSuperAdmin)) };
    }
    if (parent) return { kind: "group", parentGroupId: parent, readOnly: adminsOnly && !(me && (me.isAdmin || me.isSuperAdmin)) };
  } catch (e) {
    // fall through: ordinary group
  }
  return undefined;
};

const verifyQuotedMessage = async (
  msg: WbotMessage
): Promise<string | undefined> => {
  if (!msg.hasQuotedMsg) return undefined;

  const wbotQuotedMsg = await msg.getQuotedMessage();
  return wbotQuotedMsg.id.id;
};

const prepareLocation = (msg: WbotMessage): WbotMessage => {
  const { location } = msg as any;
  const gmapsUrl = `https://maps.google.com/maps?q=${location.latitude}%2C${location.longitude}&z=17&hl=pt-BR`;

  msg.body = `data:image/png;base64,${msg.body}|${gmapsUrl}`;
  msg.body += `|${
    location.description
      ? location.description
      : `${location.latitude}, ${location.longitude}`
  }`;

  return msg;
};

const convertToMessagePayload = async (
  msg: WbotMessage
): Promise<MessagePayload> => {
  let processedMsg = msg;
  if (msg.type === "location") {
    processedMsg = prepareLocation(msg);
  }

  const quotedMsgId = await verifyQuotedMessage(processedMsg);

  return {
    id: processedMsg.id.id,
    body: processedMsg.body,
    fromMe: processedMsg.fromMe,
    hasMedia: processedMsg.hasMedia,
    type: mapMessageType(processedMsg.type),
    timestamp: processedMsg.timestamp,
    from: processedMsg.from,
    to: processedMsg.to,
    hasQuotedMsg: processedMsg.hasQuotedMsg,
    isGif: !!(processedMsg as any)._data?.isGif,
    quotedMsgId
  };
};

const convertToMediaPayload = async (
  msg: WbotMessage
): Promise<MediaPayload | undefined> => {
  if (!msg.hasMedia) return undefined;

  // a download that fails (GIFs and stickers sometimes are not ready yet) must not lose the message:
  // two tries, then the message is stored without the file and can be loaded later on demand
  let media: any;
  for (let attempt = 0; attempt < 2 && !media; attempt += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      media = await msg.downloadMedia();
    } catch (err) {
      logger.warn(`Media download failed (${msg.type}): ${err}`);
    }
    // eslint-disable-next-line no-await-in-loop
    if (!media && attempt === 0) await new Promise(r => setTimeout(r, 2500));
  }
  if (!media) return undefined;

  return {
    filename: media.filename || "",
    mimetype: media.mimetype,
    data: media.data
  };
};

const shouldHandleMessage = (msg: WbotMessage): boolean => {
  if (msg.from === "status@broadcast" || msg.to === "status@broadcast") {
    return false;
  }

  // WhatsApp Channels (newsletters) are feeds, not conversations: no ticket, no lead, no "waiting for an answer"
  if (String(msg.from).endsWith("@newsletter") || String(msg.to).endsWith("@newsletter")) {
    return false;
  }

  if (
    !(
      msg.type === "chat" ||
      msg.type === "audio" ||
      msg.type === "ptt" ||
      msg.type === "video" ||
      msg.type === "image" ||
      msg.type === "document" ||
      msg.type === "vcard" ||
      msg.type === "sticker" ||
      msg.type === "location"
    )
  ) {
    return false;
  }

  // Check for Unicode direction mark
  if (/\u200e/.test(msg.body[0])) return false;

  // Additional validation for messages from me
  if (msg.fromMe) {
    if (
      !msg.hasMedia &&
      msg.type !== "location" &&
      msg.type !== "chat" &&
      msg.type !== "vcard"
    ) {
      return false;
    }
  }

  return true;
};

const getMessageData = async (
  msg: WbotMessage,
  wbot: Session
): Promise<{
  messagePayload: MessagePayload;
  contactPayload: ContactPayload;
  contextPayload: WhatsappContextPayload;
  mediaPayload: MediaPayload | undefined;
}> => {
  let msgContact: WbotContact;
  let groupContact: ContactPayload | undefined;

  if (msg.fromMe) {
    msgContact = await wbot.getContactById(msg.to);
  } else {
    msgContact = await msg.getContact();
  }

  const chat = await msg.getChat();

  if (chat.isGroup) {
    let msgGroupContact;

    if (msg.fromMe) {
      msgGroupContact = await wbot.getContactById(msg.to);
    } else {
      msgGroupContact = await wbot.getContactById(msg.from);
    }

    groupContact = await convertToContactPayload(msgGroupContact, wbot);
    groupContact.community = communityOf(chat, wbot);
  }

  const unreadMessages = msg.fromMe ? 0 : chat.unreadCount;

  const contactPayload = await convertToContactPayload(msgContact, wbot);
  const messagePayload = await convertToMessagePayload(msg);
  const mediaPayload = await convertToMediaPayload(msg);

  const contextPayload: WhatsappContextPayload = {
    whatsappId: wbot.id!,
    unreadMessages,
    groupContact
  };

  return {
    messagePayload,
    contactPayload,
    contextPayload,
    mediaPayload
  };
};

// After a (re)connection, catches up on everything that happened while the system was offline: messages newer than
// the last one it already stored, in both directions (including what was answered from the phone). A first
// connection imports nothing here (the history has its own, silent import), and a message already stored is never
// handled twice. Chats are not marked as read on the phone.
// Updates a stored message and tells the open screens.
const markMessageChanged = async (messageId: string, patch: { isDeleted?: boolean; body?: string; isEdited?: boolean }) => {
  const found = await Message.findByPk(messageId);
  if (!found) return;
  await found.update(patch);
  const message = await Message.findByPk(messageId, {
    include: ["contact", { model: Message, as: "quotedMsg", include: ["contact"] }]
  });
  getIO().to(String(found.ticketId)).emit("appMessage", { action: "update", message });
};

const syncUnreadMessages = async (wbot: Session, whatsappId: number) => {
  try {
    const last = await Message.findOne({
      attributes: ["createdAt"],
      include: [
        {
          model: Ticket,
          as: "ticket",
          attributes: [],
          where: { whatsappId },
          required: true
        }
      ],
      order: [["createdAt", "DESC"]]
    });
    const observedAt = new Date();
    const allChats = await wbot.getChats();
    for (const chat of allChats) {
      if (chat.unreadCount === 0) await syncChatRead(whatsappId, chat.id._serialized, observedAt);
    }
    if (!last) return;
    const sinceSeconds = Math.floor(last.createdAt.getTime() / 1000) - 5;

    const chats = allChats
      .filter(chat => (chat.timestamp || 0) >= sinceSeconds && !chat.id._serialized.includes("@broadcast"))
      .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))
      .slice(-300);

    /* eslint-disable no-restricted-syntax */
    /* eslint-disable no-await-in-loop */
    let caught = 0;
    for (const chat of chats) {
      const recent = await chat.fetchMessages({ limit: 100 });
      for (const msg of recent) {
        if (msg.timestamp < sinceSeconds || !shouldHandleMessage(msg)) continue;
        if (await Message.findByPk(msg.id.id, { attributes: ["id"] })) continue;
        const { messagePayload, contactPayload, contextPayload, mediaPayload } = await getMessageData(msg, wbot);
        await handleMessage(messagePayload, contactPayload, contextPayload, mediaPayload);
        caught += 1;
      }
    }
    if (caught) logger.info(`Session ${whatsappId}: caught up ${caught} messages from the time it was offline`);
  } catch (err) {
    logger.error(err, "Error syncing messages after reconnecting");
  }
};

const removeSession = (whatsappId: number): void => {
  try {
    const sessionIndex = sessions.findIndex(s => s.id === whatsappId);
    if (sessionIndex !== -1) {
      sessions[sessionIndex].destroy();
      sessions.splice(sessionIndex, 1);
    }
  } catch (err) {
    logger.error(err);
  }
};

const reconnectAttempts = new Map<number, number>();
const RECONNECT_MAX_ATTEMPTS = 6;

// After the QR Code is read, WhatsApp Web must finish loading ("ready"). When it never does (little memory
// for Chromium, or a WhatsApp Web update) the screen would stay on "QR CODE" forever: this timer says so and retries.
const READY_TIMEOUT_MS = 150000;
const readyTimers = new Map<number, NodeJS.Timeout>();
const clearReadyTimer = (whatsappId: number) => {
  const t = readyTimers.get(whatsappId);
  if (t) clearTimeout(t);
  readyTimers.delete(whatsappId);
};
const memoryNote = () => `memória do processo ${Math.round(process.memoryUsage().rss / 1048576)} MB`;

const sendMessage = async (
  sessionId: number,
  to: string,
  body: string,
  options?: SendMessageOptions
): Promise<ProviderMessage> => {
  const wbot = getWbot(sessionId);

  const quotedMsgSerializedId = options?.quotedMessageId
    ? getSerializedMessageId(
        to,
        Boolean(options?.quotedMessageFromMe),
        options?.quotedMessageId
      )
    : "";

  const sentMessage = await wbot.sendMessage(to, body, {
    quotedMessageId: quotedMsgSerializedId,
    linkPreview: options?.linkPreview
  });

  return convertToProviderMessage(sentMessage);
};

const sendPoll = async (
  sessionId: number,
  to: string,
  title: string,
  options: string[],
  multiple: boolean
): Promise<ProviderMessage> => {
  const sent = await getWbot(sessionId).sendMessage(to, new Poll(title, options, { allowMultipleAnswers: multiple } as any));
  return convertToProviderMessage(sent);
};

const sendMedia = async (
  sessionId: number,
  to: string,
  media: ProviderMediaInput,
  options?: SendMediaOptions
): Promise<ProviderMessage> => {
  const wbot = getWbot(sessionId);

  const messageMedia = media.path
    ? MessageMedia.fromFilePath(media.path)
    : new MessageMedia(
        media.mimetype,
        media.data?.toString("base64") || "",
        media.filename
      );

  const mediaOptions: MessageSendOptions = {
    caption: options?.caption,
    sendAudioAsVoice: options?.sendAudioAsVoice,
    quotedMessageId: options?.quotedMessageId
  };

  if (
    messageMedia.mimetype.startsWith("image/") &&
    !/^.*\.(jpe?g|png|gif)?$/i.exec(media.filename)
  ) {
    mediaOptions.sendMediaAsDocument = options?.sendMediaAsDocument || true;
  }

  const sentMessage = await wbot.sendMessage(to, messageMedia, mediaOptions);
  return convertToProviderMessage(sentMessage);
};

const checkNumber = async (
  sessionId: number,
  number: string
): Promise<string> => {
  const wbot = getWbot(sessionId);
  const validNumber = await wbot.getNumberId(`${number}@c.us`);

  return validNumber?.user || "";
};

const getProfilePicUrl = async (
  sessionId: number,
  number: string
): Promise<string> => {
  const wbot = getWbot(sessionId);
  const profilePicUrl = await wbot.getProfilePicUrl(`${number}@c.us`);
  return profilePicUrl;
};

const getChatPicUrl = async (sessionId: number, chatId: string): Promise<string | undefined> => {
  const wbot = getWbot(sessionId);
  const url = await wbot.getProfilePicUrl(chatId);
  return url || undefined;
};

const sendSeen = async (sessionId: number, chatId: string): Promise<void> => {
  const wbot = getWbot(sessionId);
  const chat = await wbot.getChatById(chatId);
  await chat.sendSeen();
};

const sendTyping = async (sessionId: number, chatId: string): Promise<void> => {
  try {
    const wbot = getWbot(sessionId);
    const chat = await wbot.getChatById(chatId);
    await chat.sendStateTyping();
  } catch (err) {
    logger.debug(`typing indicator not sent: ${err}`);
  }
};

const listGroups = async (sessionId: number) => {
  const wbot = getWbot(sessionId);
  const chats = await wbot.getChats();
  return chats
    .filter(chat => chat.isGroup)
    .map((chat: any) => ({
      id: String(chat.id.user),
      name: chat.name || chat.id.user,
      participants: (chat.participants || []).length
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
};

// What a message looks like when its file is not copied: a short label, so the conversation still reads fully.
const HISTORY_LABELS: Record<string, string> = {
  image: "📷 Imagem",
  video: "🎥 Vídeo",
  audio: "🎤 Áudio",
  ptt: "🎤 Mensagem de voz",
  document: "📄 Documento",
  sticker: "Figurinha",
  location: "📍 Localização",
  vcard: "👤 Contato",
  multi_vcard: "👤 Contatos",
  poll_creation: "📊 Enquete"
};

const importChats = async (
  sessionId: number,
  options: HistoryOptions,
  onChat: (chat: ProviderHistoryChat) => Promise<void>,
  onProgress?: (done: number, total: number) => void
): Promise<void> => {
  const wbot = getWbot(sessionId);
  const all = await wbot.getChats();
  const chats = all
    .filter(chat => {
      const id = chat.id._serialized;
      if (id.includes("@broadcast") || chat.id.server === "newsletter") return false;
      return options.includeGroups || !chat.isGroup;
    })
    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

  let done = 0;
  for (const chat of chats) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const contact = await wbot.getContactById(chat.id._serialized);
      // eslint-disable-next-line no-await-in-loop
      const payload = await convertToContactPayload(contact, wbot);
      // eslint-disable-next-line no-await-in-loop
      const raw = await chat.fetchMessages({ limit: options.perChat });
      // in groups each message carries who wrote it (looked up once per person)
      const authors = new Map<string, { name: string; number: string; lid?: string }>();
      const authorOf = async (m: WbotMessage) => {
        if (!chat.isGroup || m.fromMe) return undefined;
        const id = (m as any).author || (m as any).participant;
        if (!id) return undefined;
        if (!authors.has(id)) {
          try {
            const c = await convertToContactPayload(await wbot.getContactById(id), wbot);
            authors.set(id, { name: c.name, number: c.number, lid: c.lid });
          } catch (err) {
            authors.set(id, { name: String(id).split("@")[0], number: String(id).split("@")[0] });
          }
        }
        return authors.get(id);
      };

      const messages: ProviderHistoryChat["messages"] = [];
      for (const m of raw) {
        if (m.from === "status@broadcast" || m.to === "status@broadcast") continue;
        const body =
          (m.body && (m.type === "chat" || m.hasMedia) ? m.body : "") ||
          HISTORY_LABELS[m.type] ||
          "";
        if (!body) continue;
        messages.push({
          id: m.id.id,
          body,
          fromMe: m.fromMe,
          timestamp: m.timestamp,
          ack: mapMessageAck(m.ack),
          type: m.type,
          // eslint-disable-next-line no-await-in-loop
          author: await authorOf(m)
        });
      }
      if (messages.length) {
        // eslint-disable-next-line no-await-in-loop
        await onChat({
          isGroup: chat.isGroup,
          pinned: !!(chat as any).pinned,
          archived: !!chat.archived,
          name: chat.name || payload.name,
          contact: { name: payload.name, number: payload.number, lid: payload.lid, isGroup: chat.isGroup },
          messages
        });
      }
    } catch (err) {
      logger.warn(`History: could not copy chat ${chat.id._serialized}: ${err}`);
    }
    done += 1;
    if (onProgress && (done % 10 === 0 || done === chats.length)) onProgress(done, chats.length);
  }
};

const sendReaction = async (
  sessionId: number,
  chatId: string,
  messageId: string,
  fromMe: boolean,
  emoji: string
): Promise<void> => {
  const wbot = getWbot(sessionId);
  // same lookup as delete/edit: direct id first, then the recent messages of the chat (history copies, lid chats...)
  const message = await findMessage(wbot, chatId, messageId, fromMe);
  if (!message) throw new AppError("ERR_MESSAGE_NOT_ON_PHONE", 404);
  try {
    await message.react(emoji);
  } catch (err) {
    throw new AppError("ERR_REACTION_FAILED", 400);
  }
};

const fetchChatMessages = async (
  sessionId: number,
  chatId: string,
  limit = 100
): Promise<ProviderMessage[]> => {
  const wbot = getWbot(sessionId);
  const chat = await wbot.getChatById(chatId);
  const messages = await chat.fetchMessages({ limit });

  return messages.map(convertToProviderMessage);
};

const getContacts = async (sessionId: number): Promise<ProviderContact[]> => {
  const wbot = getWbot(sessionId);
  const contacts = await wbot.getContacts();

  // People saved in the phone's address book: marked as "my contact" or carrying a name typed on the phone.
  // Groups, channels, statuses and yourself are never imported.
  const saved = contacts.filter(
    contact =>
      !contact.isGroup &&
      !contact.isMe &&
      contact.id.server !== "status" &&
      (contact.isMyContact || !!contact.name)
  );

  const lids = saved
    .filter(contact => contact.id.server === "lid")
    .map(contact => contact.id._serialized);
  const phones = await resolvePhones(wbot, lids);

  const result: ProviderContact[] = [];
  saved.forEach(contact => {
    const isLid = contact.id.server === "lid";
    const phone = isLid
      ? phones.get(contact.id._serialized) || ""
      : onlyDigits(contact.id.user);
    if (!isPhoneNumber(phone)) return;
    result.push({
      id: phone,
      name: contact.name || contact.pushname,
      pushname: contact.pushname,
      number: phone,
      lid: isLid ? contact.id.user : undefined,
      profilePicUrl: undefined,
      isGroup: false
    });
  });

  const stats = {
    total: contacts.length,
    saved: saved.length,
    lidOnly: lids.length,
    withPhone: result.length
  };
  logger.info(
    `Session ${sessionId}: ${stats.total} contacts on WhatsApp, ${stats.saved} saved in the phone, ${stats.lidOnly} identified only by the internal id, ${stats.withPhone} with a usable phone number`
  );

  return Object.assign(result, { stats });
};

// The first time a number connects: its address book becomes the company's contacts (only for the company's own
// numbers and administrators; the address book of a regular user is personal and uses "Importar contatos"), and its
// existing conversations are copied as history for whoever owns the number.
const afterFirstConnection = async (whatsapp: Whatsapp) => {
  try {
    // WhatsApp Web needs a moment to load everything after "ready"
    await new Promise(resolve => setTimeout(resolve, 20000));

    let shareContacts = true;
    if (whatsapp.ownerId) {
      const owner = await User.findByPk(whatsapp.ownerId, { attributes: ["profile"] });
      shareContacts = owner?.profile === "admin";
    }
    if (shareContacts) {
      const saved = await SaveImportedContacts(await getContacts(whatsapp.id));
      logger.info(`Session ${whatsapp.name}: ${saved.created} contacts imported from the phone, ${saved.updated} completed`);
    }

    const { startHistoryImport } = await import("../../../services/WbotServices/ImportHistoryService");
    startHistoryImport(whatsapp, whatsapp.ownerId || null);
  } catch (err) {
    logger.error(err, "Could not import contacts and history after connecting");
  }
};

const logout = async (sessionId: number): Promise<void> => {
  const wbot = getWbot(sessionId);
  await wbot.logout();
};

// The id WhatsApp keeps for a message depends on how the chat is addressed (phone or internal id), so building it
// by hand often misses. Fall back to searching the latest messages of the chat for the short id we store.
const findMessage = async (
  wbot: Session,
  chatId: string,
  messageId: string,
  fromMe: boolean
): Promise<WbotMessage | null> => {
  const direct = await wbot
    .getMessageById(getSerializedMessageId(chatId, fromMe, messageId))
    .catch(() => null);
  if (direct) return direct;

  const chat = await wbot.getChatById(chatId).catch(() => null);
  if (!chat) return null;
  const recent = await chat.fetchMessages({ limit: 400 });
  return recent.find(m => m.id.id === messageId) || null;
};

const getGroupInfo = async (
  sessionId: number,
  chatId: string
): Promise<{ name: string; description: string; createdAt?: number; participants: { id: string; isAdmin: boolean }[] } | null> => {
  const chat: any = await getWbot(sessionId).getChatById(chatId).catch(() => null);
  if (!chat || !chat.isGroup) return null;
  return {
    name: chat.name,
    description: chat.description || "",
    createdAt: chat.createdAt ? Math.floor(new Date(chat.createdAt).getTime() / 1000) : undefined,
    participants: (chat.participants || []).map((p: any) => ({
      id: p.id?._serialized || "",
      isAdmin: !!(p.isAdmin || p.isSuperAdmin)
    }))
  };
};

const getMessageAck = async (
  sessionId: number,
  chatId: string,
  messageId: string,
  fromMe: boolean
): Promise<number | null> => {
  const message = await findMessage(getWbot(sessionId), chatId, messageId, fromMe).catch(() => null);
  return message ? mapMessageAck(message.ack) : null;
};

const downloadMessageMedia = async (
  sessionId: number,
  chatId: string,
  messageId: string,
  fromMe: boolean
): Promise<{ filename: string; mimetype: string; data: string; isGif?: boolean } | null> => {
  const message = await findMessage(getWbot(sessionId), chatId, messageId, fromMe);
  if (!message || !message.hasMedia) return null;
  const media = await message.downloadMedia();
  if (!media) return null;
  return { filename: media.filename || "", mimetype: media.mimetype, data: media.data, isGif: !!(message as any)._data?.isGif };
};

const deleteMessage = async (
  sessionId: number,
  chatId: string,
  messageId: string,
  fromMe: boolean
): Promise<void> => {
  const wbot = getWbot(sessionId);
  const message = await findMessage(wbot, chatId, messageId, fromMe);
  if (!message) throw new AppError("ERR_MESSAGE_NOT_ON_PHONE", 404);
  await message.delete(true);
};

const editMessage = async (
  sessionId: number,
  chatId: string,
  messageId: string,
  fromMe: boolean,
  body: string
): Promise<void> => {
  const wbot = getWbot(sessionId);
  const message = await findMessage(wbot, chatId, messageId, fromMe);
  if (!message) throw new AppError("ERR_MESSAGE_NOT_ON_PHONE", 404);
  const edited = await message.edit(body);
  if (!edited) throw new AppError("ERR_EDIT_NOT_ALLOWED", 400);
};

// A container that was stopped (deploy, restart) leaves Chromium's "profile in use" markers behind, tied to the old
// container's hostname. The next start then refuses to open the saved session. Only one process owns each
// session here (leader lock), so the markers are always stale at this point.
const clearStaleBrowserLocks = (whatsappId: number): void => {
  const profile = path.join(WWEBJS_AUTH_DIR, `session-bd_${whatsappId}`);
  ["SingletonLock", "SingletonCookie", "SingletonSocket"].forEach(name => {
    try {
      fs.rmSync(path.join(profile, name), { force: true });
    } catch (err) {
      logger.warn(`Could not remove ${name} of session ${whatsappId}`);
    }
  });
};

const init = async (whatsapp: Whatsapp): Promise<void> => {
  try {
    removeSession(whatsapp.id);

    const io = getIO();
    const sessionName = whatsapp.name;

    const args: string = process.env.CHROME_ARGS || "";

    clearStaleBrowserLocks(whatsapp.id);

    const wbot: Session = new Client({
      authStrategy: new LocalAuth({ clientId: `bd_${whatsapp.id}`, dataPath: WWEBJS_AUTH_DIR }),
      puppeteer: {
        // headless: false, // TODO make sure chromium closes on session disconnection / delete
        executablePath: process.env.CHROME_BIN || undefined,
        browserWSEndpoint: process.env.CHROME_WS || undefined,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-accelerated-2d-canvas",
          "--no-first-run",
          "--no-zygote",
          "--disable-gpu",
          // lighter and faster on a small server: nothing the WhatsApp session does not need
          "--disable-extensions",
          "--disable-background-networking",
          "--disable-default-apps",
          "--disable-sync",
          "--disable-translate",
          "--metrics-recording-only",
          "--mute-audio",
          "--no-default-browser-check",
          "--disable-features=Translate,MediaRouter,OptimizationHints,BackForwardCache",
          ...args.split(" ")
        ]
      }
    });

    wbot.on("qr", async qr => {
      logger.info("Session:", sessionName);
      qrCode.generate(qr, { small: true });
      await whatsapp.update({ qrcode: qr, status: "qrcode", retries: 0 });

      const sessionIndex = sessions.findIndex(s => s.id === whatsapp.id);
      if (sessionIndex === -1) {
        wbot.id = whatsapp.id;
        sessions.push(wbot);
      }

      io.emit("whatsappSession", {
        action: "update",
        session: whatsapp
      });
    });

    wbot.on("authenticated", async () => {
      logger.info(`Session: ${sessionName} AUTHENTICATED (QR Code lido, carregando o WhatsApp Web; ${memoryNote()})`);
      try {
        await whatsapp.update({ status: "OPENING", qrcode: "" });
        io.emit("whatsappSession", { action: "update", session: whatsapp });
      } catch (err) {
        logger.error(err, "Error on whatsapp authenticated event");
      }
      clearReadyTimer(whatsapp.id);
      readyTimers.set(
        whatsapp.id,
        setTimeout(async () => {
          readyTimers.delete(whatsapp.id);
          logger.error(
            `Session: ${sessionName} não ficou pronta em ${READY_TIMEOUT_MS / 1000}s depois de ler o QR Code (${memoryNote()}). ` +
              "Causas comuns: pouca memória no servidor para o Chromium, ou o WhatsApp Web mudou. Reiniciando a sessão."
          );
          try {
            await whatsapp.update({ status: "TIMEOUT" });
            io.emit("whatsappSession", { action: "update", session: whatsapp });
            await wbot.destroy().catch(() => undefined);
          } catch (err) {
            logger.error(err, "Error closing a session that did not become ready");
          }
          const attempt = (reconnectAttempts.get(whatsapp.id) || 0) + 1;
          reconnectAttempts.set(whatsapp.id, attempt);
          if (attempt > RECONNECT_MAX_ATTEMPTS) {
            await whatsapp.update({ status: "DISCONNECTED" }).catch(() => undefined);
            io.emit("whatsappSession", { action: "update", session: whatsapp });
            return;
          }
          init(whatsapp);
        }, READY_TIMEOUT_MS)
      );
    });

    wbot.on("loading_screen", (percent: any, message: any) => {
      logger.info(`Session: ${sessionName} carregando ${percent}% ${message || ""}`);
    });

    wbot.on("auth_failure", async msg => {
      clearReadyTimer(whatsapp.id);
      console.error(
        `Session: ${sessionName} AUTHENTICATION FAILURE! Reason: ${msg}`
      );

      if (whatsapp.retries > 1) {
        await whatsapp.update({ session: "", retries: 0 });
      }

      await whatsapp.update({
        status: "DISCONNECTED",
        retries: whatsapp.retries + 1
      });

      io.emit("whatsappSession", {
        action: "update",
        session: whatsapp
      });
    });

    wbot.on("ready", async () => {
      clearReadyTimer(whatsapp.id);
      logger.info(`Session: ${sessionName} READY (${memoryNote()})`);
      reconnectAttempts.set(whatsapp.id, 0);

      const firstConnection = !whatsapp.connectedSince;

      try {
        await whatsapp.update({
          status: "CONNECTED",
          qrcode: "",
          retries: 0,
          ...(whatsapp.connectedSince ? {} : { connectedSince: new Date() })
        });

        io.emit("whatsappSession", {
          action: "update",
          session: whatsapp
        });

        const sessionIndex = sessions.findIndex(s => s.id === whatsapp.id);
        if (sessionIndex === -1) {
          wbot.id = whatsapp.id;
          sessions.push(wbot);
        }

        wbot.sendPresenceAvailable();
        await syncUnreadMessages(wbot, whatsapp.id);
        if (firstConnection) afterFirstConnection(whatsapp);
      } catch (err) {
        logger.error(err, "Error on whatsapp ready event");
      }
    });

    wbot.on("change_state", async newState => {
      logger.info(`Monitor session: ${sessionName}, ${newState}`);
      try {
        await whatsapp.update({ status: newState });

        io.emit("whatsappSession", {
          action: "update",
          session: whatsapp
        });
      } catch (err) {
        logger.error(err, "Error on whatsapp change state event");
      }
    });

    wbot.on("disconnected", async reason => {
      clearReadyTimer(whatsapp.id);
      logger.info(`Disconnected session: ${sessionName}, reason: ${reason}`);
      try {
        await whatsapp.update({ status: "OPENING", session: "" });

        io.emit("whatsappSession", {
          action: "update",
          session: whatsapp
        });

        onDisconnected(whatsapp.id, String(reason));

        // exponential backoff: hammering WhatsApp with reconnects is itself a
        // ban signal, so give up after a few tries and wait for a person
        const attempt = (reconnectAttempts.get(whatsapp.id) || 0) + 1;
        reconnectAttempts.set(whatsapp.id, attempt);
        if (attempt > RECONNECT_MAX_ATTEMPTS) {
          logger.error(`Session ${sessionName}: giving up after ${attempt - 1} reconnect attempts`);
          await whatsapp.update({ status: "DISCONNECTED", qrcode: "" });
          io.emit("whatsappSession", { action: "update", session: whatsapp });
          // WhatsApp also unlinks linked devices when the phone stays offline for about 14 days
          io.emit("whatsappAlert", { whatsappId: whatsapp.id, name: whatsapp.name, ownerId: whatsapp.ownerId, reason: String(reason) });
          return;
        }
        const delay = Math.min(2000 * 2 ** (attempt - 1), 60000);
        logger.warn(
          `Session ${sessionName} disconnected. Restarting in ${delay / 1000}s (attempt ${attempt})...`
        );

        await new Promise(r => setTimeout(r, delay));

        init(whatsapp);
      } catch (err) {
        logger.error(err, "Error on whatsapp disconnected event");
      }
    });

    wbot.on("message_create", async msg => {
      if (!shouldHandleMessage(msg)) return;

      try {
        const { messagePayload, contactPayload, contextPayload, mediaPayload } =
          await getMessageData(msg, wbot);

        await handleMessage(
          messagePayload,
          contactPayload,
          contextPayload,
          mediaPayload
        );
      } catch (err) {
        logger.error(err, "Error on whatsapp message create event");
      }
    });

    wbot.on("media_uploaded", async msg => {
      if (!shouldHandleMessage(msg)) return;

      try {
        const { messagePayload, contactPayload, contextPayload, mediaPayload } =
          await getMessageData(msg, wbot);

        await handleMessage(
          messagePayload,
          contactPayload,
          contextPayload,
          mediaPayload
        );
      } catch (err) {
        logger.error(err, "Error on whatsapp media uploaded event");
      }
    });

    wbot.on("message_reaction", async (reaction: any) => {
      try {
        const sender = String(reaction.senderId || "");
        const mine = sender === (wbot as any).info?.wid?._serialized;
        await applyReaction(reaction.msgId?.id, reaction.reaction || "", mine, mine ? "me" : sender);
      } catch (err) {
        logger.error(err, "Error on whatsapp reaction event");
      }
    });

    // the other person deleted a message for everyone
    wbot.on("message_revoke_everyone", async (after: WbotMessage, before?: WbotMessage) => {
      try {
        const id = (before || after)?.id?.id || after?.id?.id;
        if (id) await markMessageChanged(id, { isDeleted: true });
      } catch (err) {
        logger.error(err, "Error on whatsapp message revoke event");
      }
    });

    // a message was edited (by the person or from the phone)
    wbot.on("message_edit", async (msg: WbotMessage, newBody: string) => {
      try {
        if (msg?.id?.id) await markMessageChanged(msg.id.id, { body: newBody, isEdited: true });
      } catch (err) {
        logger.error(err, "Error on whatsapp message edit event");
      }
    });

    // a call nobody answered here: it becomes a line in the conversation, so it is never missed
    wbot.on("call", async (call: any) => {
      try {
        if (call.isGroup || !call.from) return;
        const contact = await wbot.getContactById(call.from);
        const contactPayload = await convertToContactPayload(contact, wbot);
        await handleMessage(
          {
            id: `call-${call.id}`,
            body: `📞 Ligação ${call.isVideo ? "de vídeo " : ""}recebida, não atendida por aqui.`,
            fromMe: false,
            hasMedia: false,
            type: "chat",
            timestamp: call.timestamp || Math.floor(Date.now() / 1000),
            from: call.from,
            to: ""
          } as any,
          contactPayload,
          { whatsappId: whatsapp.id, unreadMessages: 1 } as any,
          undefined
        );
      } catch (err) {
        logger.error(err, "Error on whatsapp call event");
      }
    });

    // The event uses either a phone id, group id or LID depending on the account.
    wbot.on("unread_count", async (chat: any) => {
      const observedAt = new Date();
      try {
        if (Number(chat?.unreadCount) !== 0) return;
        await syncChatRead(whatsapp.id, chat.id?._serialized || chat.id?.user || "", observedAt);
      } catch (err) { logger.warn(`unread_count sync failed: ${err.message}`); }
    });

    wbot.on("message_ack", async (msg, ack) => {
      handleMessageAck(msg.id.id, mapMessageAck(ack));
    });

    await wbot.initialize();
  } catch (err) {
    logger.error(err, "Error on whatsapp session");
    // the screen must not stay on "QR CODE" when the browser could not even start
    try {
      await whatsapp.update({ status: "DISCONNECTED", qrcode: "" });
      getIO().emit("whatsappSession", { action: "update", session: whatsapp });
    } catch (e) {
      logger.error(e, "Error saving the failed session status");
    }
  }
};

export const WhatsappWebJsProvider: WhatsappProvider = {
  init,
  removeSession,
  logout,
  sendMessage,
  sendMedia,
  deleteMessage,
  editMessage,
  checkNumber,
  getProfilePicUrl,
  getChatPicUrl,
  getContacts,
  sendSeen,
  sendTyping,
  listGroups,
  importChats,
  sendPoll,
  getGroupInfo,
  getMessageAck,
  getChatUnreadCount: async (sessionId, chatId) => {
    const chat = await getWbot(sessionId).getChatById(chatId);
    return Number.isFinite(chat.unreadCount) ? chat.unreadCount : null;
  },
  downloadMessageMedia,
  sendReaction,
  fetchChatMessages
};
