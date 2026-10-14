import qrCode from "qrcode-terminal";
import {
  Client,
  LocalAuth,
  MessageMedia,
  Message as WbotMessage,
  Contact as WbotContact,
  MessageSendOptions
} from "whatsapp-web.js";
import { applyReaction } from "../../../services/MessageServices/MessageActions";
import { WWEBJS_AUTH_DIR } from "../../../config/paths";
import fs from "fs";
import path from "path";
import { onDisconnected } from "../../../services/SafetyServices/SendGuard";
import { getIO } from "../../../libs/socket";
import Whatsapp from "../../../models/Whatsapp";
import AppError from "../../../errors/AppError";
import SaveImportedContacts from "../../../helpers/SaveImportedContacts";
import User from "../../../models/User";
import Message from "../../../models/Message";
import Ticket from "../../../models/Ticket";
import { logger } from "../../../utils/logger";
import { WhatsappProvider } from "../whatsappProvider";
import {
  ProviderMessage,
  ProviderMediaInput,
  SendMessageOptions,
  SendMediaOptions,
  MessageType,
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
    0: 0,
    1: 1,
    2: 2,
    3: 3,
    4: 4
  };
  return ackMap[wbotAck] || 0;
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

const convertToContactPayload = async (
  msgContact: WbotContact
): Promise<ContactPayload> => {
  const profilePicUrl = await getProfilePic(msgContact);

  return {
    name: msgContact.name || msgContact.pushname || msgContact.id.user,
    number: msgContact.id.user,
    profilePicUrl,
    isGroup: msgContact.isGroup
  };
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
    quotedMsgId
  };
};

const convertToMediaPayload = async (
  msg: WbotMessage
): Promise<MediaPayload | undefined> => {
  if (!msg.hasMedia) return undefined;

  const media = await msg.downloadMedia();
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

    groupContact = await convertToContactPayload(msgGroupContact);
  }

  const unreadMessages = msg.fromMe ? 0 : chat.unreadCount;

  const contactPayload = await convertToContactPayload(msgContact);
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

// After a (re)connection, catches up only on what arrived while the system was offline: messages newer than the
// last one it already stored. A first connection imports nothing, and old unanswered chats never become tickets.
// Chats are not marked as read on the phone.
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
    if (!last) return;
    const sinceSeconds = Math.floor(last.createdAt.getTime() / 1000) - 5;

    const chats = await wbot.getChats();

    /* eslint-disable no-restricted-syntax */
    /* eslint-disable no-await-in-loop */
    for (const chat of chats) {
      if (chat.unreadCount > 0 && !chat.isGroup) {
        const unreadMessages = await chat.fetchMessages({
          limit: chat.unreadCount
        });

        for (const msg of unreadMessages) {
          if (msg.timestamp >= sinceSeconds && shouldHandleMessage(msg)) {
            const {
              messagePayload,
              contactPayload,
              contextPayload,
              mediaPayload
            } = await getMessageData(msg, wbot);

            handleMessage(
              messagePayload,
              contactPayload,
              contextPayload,
              mediaPayload
            );
          }
        }
      }
    }
  } catch (err) {
    logger.error(err, "Error syncing unread messages");
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

const sendReaction = async (
  sessionId: number,
  chatId: string,
  messageId: string,
  fromMe: boolean,
  emoji: string
): Promise<void> => {
  const wbot = getWbot(sessionId);
  const message = await wbot.getMessageById(getSerializedMessageId(chatId, fromMe, messageId));
  if (!message) throw new Error("message not found");
  await message.react(emoji);
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

  // People saved in the phone's address book. WhatsApp now identifies many people by an "@lid" id that hides
  // the phone, so the number is taken from the contact itself when the id is not a phone id. Groups, channels,
  // statuses and yourself are never imported.
  const phoneOf = (contact: WbotContact): string => {
    const fromId = contact.id.server === "c.us" ? contact.id.user : "";
    const raw = fromId || String((contact as any).number || "");
    const digits = raw.replace(/\D/g, "");
    return digits.length >= 8 && digits.length <= 15 ? digits : "";
  };

  const saved = contacts.filter(
    contact => contact.isMyContact && !contact.isGroup && !contact.isMe
  );
  const result = saved
    .map(contact => ({ contact, number: phoneOf(contact) }))
    .filter(item => item.number)
    .map(({ contact, number }) => ({
      id: number,
      name: contact.name || contact.pushname,
      pushname: contact.pushname,
      number,
      profilePicUrl: undefined,
      isGroup: false
    }));

  logger.info(
    `Session ${sessionId}: ${contacts.length} contacts on WhatsApp, ${saved.length} saved in the phone, ${result.length} with a usable phone number`
  );

  return result;
};

// The first time a number connects, its address book becomes the company's contact list. Numbers that belong
// to a regular user are not copied automatically (their contacts are personal): they use "Importar contatos".
const importContactsOnFirstConnection = async (whatsapp: Whatsapp) => {
  try {
    if (whatsapp.ownerId) {
      const owner = await User.findByPk(whatsapp.ownerId, {
        attributes: ["profile"]
      });
      if (owner?.profile !== "admin") return;
    }
    // WhatsApp Web needs a moment to load the address book after "ready"
    await new Promise(resolve => setTimeout(resolve, 15000));
    const list = await getContacts(whatsapp.id);
    const created = await SaveImportedContacts(list);
    logger.info(
      `Session ${whatsapp.name}: ${created} contacts imported from the phone`
    );
  } catch (err) {
    logger.error(err, "Could not import contacts after connecting");
  }
};

const logout = async (sessionId: number): Promise<void> => {
  const wbot = getWbot(sessionId);
  await wbot.logout();
};

const deleteMessage = async (
  sessionId: number,
  chatId: string,
  messageId: string,
  fromMe: boolean
): Promise<void> => {
  const wbot = getWbot(sessionId);

  const serializedMsgId = getSerializedMessageId(chatId, fromMe, messageId);

  const message = await wbot.getMessageById(serializedMsgId);

  await message.delete(true);
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
        if (firstConnection) importContactsOnFirstConnection(whatsapp);
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
  checkNumber,
  getProfilePicUrl,
  getContacts,
  sendSeen,
  sendTyping,
  listGroups,
  sendReaction,
  fetchChatMessages
};
