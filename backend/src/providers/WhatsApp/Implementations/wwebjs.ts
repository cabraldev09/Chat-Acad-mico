import { remember } from "../../../helpers/BoundedMap";
import { watchChatState } from "../../../services/WbotServices/ChatState";
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
// the last steps of the start of whatsapp-web.js, used by the repair of a page that never said "ready" (see healInjection)
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { LoadUtils } = require("whatsapp-web.js/src/util/Injected/Utils");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ClientInfo = require("whatsapp-web.js/src/structures/ClientInfo");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const InterfaceController = require("whatsapp-web.js/src/util/InterfaceController");
import { applyReaction } from "../../../services/MessageServices/MessageActions";
import { WWEBJS_AUTH_DIR } from "../../../config/paths";
import fs from "fs";
import path from "path";
import { onDisconnected } from "../../../services/SafetyServices/SendGuard";
import { getIO } from "../../../libs/socket";
import Whatsapp from "../../../models/Whatsapp";
import AppError from "../../../errors/AppError";
import SaveImportedContacts from "../../../helpers/SaveImportedContacts";
import CreateOrUpdateContactService from "../../../services/ContactServices/CreateOrUpdateContactService";
import { isPhoneNumber } from "../../../helpers/ChatId";
import User from "../../../models/User";
import Contact from "../../../models/Contact";
import Message from "../../../models/Message";
import Ticket from "../../../models/Ticket";
import { Op, QueryTypes } from "sequelize";
import sequelize from "../../../database";
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
      remember(picCache, key, { url: url || undefined, at: Date.now() });
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
        remember(phoneOfLid, id, phone);
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
const serializedId = (v: any): string | null => (v && (v._serialized || (typeof v === "string" ? v : null))) || null;

const communityOf = (chat: any, wbot: any): ContactPayload["community"] => {
  try {
    const md = chat?.groupMetadata || {};
    const type = String(md.groupType || md.type || "").toUpperCase();
    const parent = serializedId(md.parentGroupId) || serializedId(md.parentGroup) || serializedId(md.parent) || serializedId(md.linkedParent) || null;
    const isParent = md.isParentGroup === true || md.isCommunity === true || type === "COMMUNITY" || type === "PARENT";
    const isAnnouncement = md.isCommunityAnnounce === true || md.isDefaultSubgroup === true || md.defaultSubgroup === true || type === "DEFAULT_SUBGROUP" || type === "COMMUNITY_ANNOUNCEMENT" || type === "LINKED_ANNOUNCEMENT_GROUP";
    const meId = wbot?.info?.wid?._serialized;
    const me = (chat.participants || []).find((p: any) => p.id?._serialized === meId);
    const adminsOnly = md.announce === true || chat.isReadOnly === true;
    const readOnly = adminsOnly && !(me && (me.isAdmin || me.isSuperAdmin));
    if (isParent) return { kind: "community", role: "parent", communityId: serializedId(chat.id), parentGroupId: null, readOnly };
    if (isAnnouncement) return { kind: "community", role: "announcement", communityId: parent, parentGroupId: parent, readOnly };
    if (parent) return { kind: "group", role: "member", communityId: parent, parentGroupId: parent, readOnly };
  } catch (e) {
    // fall through: ordinary group
  }
  return undefined;
};

// Reads every group of the number once and records which communities exist, their announcements group and the groups
// inside them (the "Comunidades" list of WhatsApp Web). A community parent has no messages, so it may not be among the
// chats: it is created from what its groups say about it.
const syncCommunities = async (wbot: Session): Promise<number> => {
  const chats: any[] = await wbot.getChats();
  const known = new Set<string>();
  const parents = new Set<string>();
  let found = 0;
  for (const chat of chats.filter(c => c.isGroup)) {
    const info = communityOf(chat, wbot);
    if (!info) continue;
    const id = serializedId(chat.id);
    if (!id) continue;
    known.add(id);
    if (info.communityId) parents.add(info.communityId);
    let pic: string | undefined;
    try { pic = (await wbot.getProfilePicUrl(id)) || undefined; } catch (e) { pic = undefined; }
    // eslint-disable-next-line no-await-in-loop
    await CreateOrUpdateContactService({ name: chat.name || chat.id.user, number: chat.id.user, isGroup: true, profilePicUrl: pic, community: info });
    found += 1;
  }
  for (const parentId of parents) {
    if (known.has(parentId)) continue;
    let name = "Comunidade";
    let pic: string | undefined;
    try {
      const c: any = await wbot.getContactById(parentId);
      name = c?.name || c?.pushname || name;
      pic = (await wbot.getProfilePicUrl(parentId)) || undefined;
    } catch (e) { /* the name stays generic until WhatsApp tells it */ }
    // eslint-disable-next-line no-await-in-loop
    await CreateOrUpdateContactService({ name, number: parentId.split("@")[0], isGroup: true, profilePicUrl: pic, community: { kind: "community", role: "parent", communityId: parentId, parentGroupId: null, readOnly: true } });
    found += 1;
  }
  return found;
};

// What the phone shows, the list shows the same: the chats pinned at the top, and the pictures of the chats that have
// none yet. Reads the chats once (it is a local read inside WhatsApp Web) and only writes what changed.
const photoTried = new Map<string, number>();
const syncChatTimes = async (chats: any[], whatsappId: number, key: (isGroup: boolean, number: string) => string): Promise<void> => {
  const times = new Map<string, number>();
  for (const c of chats) {
    const seconds = Number(c.timestamp) || 0;
    if (c.id?.user && seconds > 0 && !c.isNewsletter) times.set(key(!!c.isGroup, String(c.id.user)), seconds * 1000);
  }
  if (!times.size) return;
  const numbers = [...new Set([...times.keys()].map(k => k.slice(2)))];
  const byContact = new Map<number, number>();
  for (let i = 0; i < numbers.length; i += 500) {
    // eslint-disable-next-line no-await-in-loop
    const contacts = await Contact.findAll({ where: { number: { [Op.in]: numbers.slice(i, i + 500) } }, attributes: ["id", "number", "isGroup"] });
    contacts.forEach(ct => { const t = times.get(key(!!ct.isGroup, String(ct.number))); if (t) byContact.set(ct.id, t); });
  }
  if (!byContact.size) return;
  const ids = [...byContact.keys()];
  const tickets: Ticket[] = [];
  for (let i = 0; i < ids.length; i += 500) {
    // eslint-disable-next-line no-await-in-loop
    tickets.push(...(await Ticket.findAll({ where: { whatsappId, isHistorical: false, contactId: { [Op.in]: ids.slice(i, i + 500) } }, attributes: ["id", "contactId", "waChatTimestamp"] })));
  }
  let changed = 0;
  for (const t of tickets) {
    const at = byContact.get(t.contactId) as number;
    if (t.waChatTimestamp && Math.abs(new Date(t.waChatTimestamp).getTime() - at) < 1000) continue;
    // eslint-disable-next-line no-await-in-loop
    await Ticket.update({ waChatTimestamp: new Date(at) } as any, { where: { id: t.id }, silent: true } as any);
    changed += 1;
  }
  if (changed) getIO().emit("ticketsReorder", { whatsappId });
};
const syncChatState = async (wbot: Session, whatsappId: number): Promise<void> => {
  const chats: any[] = await wbot.getChats();
  const key = (isGroup: boolean, number: string) => `${isGroup ? "g" : "p"}:${number}`;
  const pinned = new Set<string>();
  chats.filter(c => c.pinned && !c.archived && c.id?.user).forEach(c => pinned.add(key(!!c.isGroup, c.id.user)));

  // the phone allows only a few pinned chats: look at those and at what is marked now, never at every ticket of the number
  const pinnedChats = chats.filter(c => c.pinned && !c.archived && c.id?.user);
  const pinnedContacts = pinnedChats.length
    ? await Contact.findAll({ where: { number: { [Op.in]: pinnedChats.map(c => String(c.id.user)) } }, attributes: ["id", "number", "isGroup"] })
    : [];
  const shouldBe = pinnedContacts.filter(ct => pinned.has(key(!!ct.isGroup, String(ct.number)))).map(ct => ct.id);
  const marked = await Ticket.findAll({ where: { whatsappId, isHistorical: false, waPinned: true }, attributes: ["id", "contactId"] });
  const wanted = shouldBe.length
    ? await Ticket.findAll({ where: { whatsappId, isHistorical: false, contactId: { [Op.in]: shouldBe } }, attributes: ["id", "waPinned"] })
    : [];
  const turnOn: number[] = wanted.filter(t => !t.waPinned).map(t => t.id);
  const wantedIds = new Set(wanted.map(t => t.id));
  const turnOff: number[] = marked.filter(t => !wantedIds.has(t.id)).map(t => t.id);
  if (turnOn.length) await Ticket.update({ waPinned: true }, { where: { id: { [Op.in]: turnOn } } });
  if (turnOff.length) await Ticket.update({ waPinned: false }, { where: { id: { [Op.in]: turnOff } } });
  if (turnOn.length || turnOff.length) getIO().emit("ticketPins", { whatsappId, pinned: turnOn, unpinned: turnOff });

  // the time WhatsApp gives each chat: the list is ordered like the phone's (only what differs is written)
  await syncChatTimes(chats, whatsappId, key).catch(err => logger.warn(`chat times (${whatsappId}) failed: ${err}`));

  // pictures: the most recent chats first, a few per round, and a chat without a picture is not asked again for hours
  const recent = [...chats].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)).slice(0, 120).filter(c => c.id?.user);
  const contacts = await Contact.findAll({
    where: { number: { [Op.in]: recent.map(c => String(c.id.user)) } },
    attributes: ["id", "number", "isGroup", "profilePicUrl"]
  });
  const missing = new Map<string, Contact>();
  contacts.forEach(c => { if (!c.getDataValue("profilePicUrl")) missing.set(key(!!c.isGroup, String(c.number)), c); });
  let asked = 0;
  for (const chat of recent) {
    if (asked >= 25) break;
    const k = key(!!chat.isGroup, String(chat.id.user));
    const contact = missing.get(k);
    if (!contact) continue;
    const last = photoTried.get(`${whatsappId}:${k}`) || 0;
    if (Date.now() - last < 6 * 3600 * 1000) continue;
    remember(photoTried, `${whatsappId}:${k}`, Date.now());
    asked += 1;
    try {
      // eslint-disable-next-line no-await-in-loop
      const pic = await wbot.getProfilePicUrl(serializedId(chat.id) as string);
      if (pic) {
        // eslint-disable-next-line no-await-in-loop
        await contact.update({ profilePicUrl: pic });
        getIO().emit("contact", { action: "update", contact });
      }
    } catch (e) { /* no picture (privacy) or not reachable now: the placeholder stays */ }
  }
};

const communityTimers = new Map<number, NodeJS.Timeout>();
const scheduleCommunitySync = (wbot: Session, whatsappId: number, delayMs: number): void => {
  const old = communityTimers.get(whatsappId);
  if (old) clearTimeout(old);
  communityTimers.set(whatsappId, setTimeout(() => {
    communityTimers.delete(whatsappId);
    syncCommunities(wbot).catch(err => logger.warn(`communities sync (${whatsappId}) failed: ${err}`));
  }, delayMs));
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

  const labelled = msg.type === "poll_creation" || msg.type === "multi_vcard";
  return {
    id: processedMsg.id.id,
    body: labelled ? `${HISTORY_LABELS[msg.type]}${(msg as any).pollName ? `: ${(msg as any).pollName}` : ""}` : processedMsg.body,
    fromMe: processedMsg.fromMe,
    hasMedia: processedMsg.hasMedia,
    type: labelled ? "chat" : mapMessageType(processedMsg.type),
    timestamp: processedMsg.timestamp,
    from: processedMsg.from,
    to: processedMsg.to,
    hasQuotedMsg: processedMsg.hasQuotedMsg,
    isGif: !!(processedMsg as any)._data?.isGif,
    quotedMsgId
  };
};

// Why a file did not come down: the stage WhatsApp Web gives the message (REUPLOADING = waiting for the phone to send it again, ERROR_* = the file is gone from their servers...)
const whyNoMedia = async (msg: any): Promise<string> => {
  try {
    const info = await msg.client.pupPage.evaluate((id: string) => {
      const { Msg } = (window as any).require("WAWebCollections");
      const m = Msg.get(id);
      if (!m) return { missing: true };
      return { stage: m.mediaData && m.mediaData.mediaStage, type: m.type, directPath: !!m.directPath, size: m.size, hasWWebJS: !!(window as any).WWebJS && !!(window as any).WWebJS.resolveMediaBlob };
    }, msg.id._serialized);
    return JSON.stringify(info);
  } catch (err) {
    return `sem leitura (${(err as Error).message})`;
  }
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
  if (!media) {
    logger.warn(`Media not downloaded (${msg.type}, ${msg.id.id}): ${await whyNoMedia(msg)}`);
    return undefined;
  }

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
      msg.type === "location" ||
      // a poll and a list of contacts reach the screen as a short label, like in the imported history
      msg.type === "poll_creation" ||
      msg.type === "multi_vcard"
    )
  ) {
    return false;
  }

  // Check for Unicode direction mark (the mark of the robot's own messages); a message with no text (a file alone) is not a mark
  if (msg.body && /\u200e/.test(msg.body[0])) return false;

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

// One run at a time per number. `syncedAt` is when the last run STARTED: everything older was already looked at, so the next run (every few minutes) only
// needs what came after it, and the first run after a (re)connection starts from the newest message that was stored.
const syncing = new Set<number>();
const syncedAt = new Map<number, number>();
const SYNC_MARGIN_S = 120;
// per number: the chat time (and chat) already looked at because WhatsApp was ahead of the stored messages
const gapChecked = new Map<number, Map<string, number>>();

const syncUnreadMessages = async (wbot: Session, whatsappId: number, opts: { periodic?: boolean } = {}) => {
  if (syncing.has(whatsappId)) return;
  syncing.add(whatsappId);
  const startedAt = Date.now();
  try {
    let sinceSeconds: number | null = null;
    const previous = syncedAt.get(whatsappId);
    if (previous) sinceSeconds = Math.floor(previous / 1000) - SYNC_MARGIN_S;
    else {
      const last = await Message.findOne({
        attributes: ["createdAt"],
        include: [{ model: Ticket, as: "ticket", attributes: [], where: { whatsappId }, required: true }],
        order: [["createdAt", "DESC"]]
      });
      if (last) sinceSeconds = Math.floor(last.createdAt.getTime() / 1000) - 5;
    }
    const observedAt = new Date();
    const allChats = await withTimeout(wbot.getChats(), 180000);
    for (const chat of allChats) {
      if (chat.unreadCount === 0) await syncChatRead(whatsappId, chat.id._serialized, observedAt);
    }
    // a first connection imports nothing here (the history has its own, silent import)
    if (sinceSeconds === null) {
      syncedAt.set(whatsappId, startedAt);
      return;
    }
    const since = sinceSeconds;
    // besides the time window: every chat where WhatsApp is ahead of what we hold (its last activity is newer than the newest message stored for it)
    // is looked at, whatever the window says. Each chat time is looked at once (a last event we do not store, like a call, would otherwise repeat forever).
    const stored = (await sequelize.query(
      `SELECT t."contactId", MAX(m."createdAt") AS last FROM "Messages" m JOIN "Tickets" t ON t.id = m."ticketId" WHERE t."whatsappId" = :whatsappId GROUP BY t."contactId"`,
      { replacements: { whatsappId }, type: QueryTypes.SELECT }
    )) as any[];
    const lastOf = new Map<number, number>(stored.map(r => [Number(r.contactId), new Date(r.last).getTime()]));
    const numbersOf = allChats.map(c => String(c.id?.user || "")).filter(Boolean);
    const known = new Map<string, number>();
    for (let i = 0; i < numbersOf.length; i += 500) {
      // eslint-disable-next-line no-await-in-loop
      const cs = await Contact.findAll({ where: { number: { [Op.in]: numbersOf.slice(i, i + 500) } }, attributes: ["id", "number", "isGroup"] });
      cs.forEach(c => known.set(`${c.isGroup ? "g" : "p"}:${c.number}`, c.id));
    }
    const checked = (gapChecked.get(whatsappId) || new Map<string, number>());
    gapChecked.set(whatsappId, checked);
    const behind = (chat: any): boolean => {
      const t = (chat.timestamp || 0) * 1000;
      if (!t || checked.get(chat.id._serialized) === chat.timestamp) return false;
      const cid = known.get(`${chat.isGroup ? "g" : "p"}:${chat.id.user}`);
      return !cid || !lastOf.has(cid) || t > (lastOf.get(cid) as number) + 5000;
    };
    const chats = allChats
      .filter(chat => !chat.id._serialized.includes("@broadcast") && !chat.id._serialized.endsWith("@newsletter") && ((chat.timestamp || 0) >= since || behind(chat)))
      .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))
      .slice(-1000);
    if (!opts.periodic || chats.length) logger.info(`Session ${whatsappId}: ${opts.periodic ? "conferindo" : "recuperando"} mensagens de ${chats.length} conversas desde ${new Date(since * 1000).toISOString()}`);

    /* eslint-disable no-restricted-syntax */
    /* eslint-disable no-await-in-loop */
    let caught = 0;
    let failed = 0;
    for (const chat of chats) {
      // one chat that fails (a deleted group, a slow page) never stops the others
      try {
        const gap = behind(chat) && (chat.timestamp || 0) < since;
        const recent = await withTimeout(chat.fetchMessages({ limit: gap ? 60 : opts.periodic ? 40 : 100 }), 45000);
        for (const msg of recent) {
          // a chat found behind is read to the end of what was fetched; a chat inside the window only from the mark
          if ((!gap && msg.timestamp < since) || !shouldHandleMessage(msg)) continue;
          if (await Message.findByPk(msg.id.id, { attributes: ["id"] })) continue;
          const { messagePayload, contactPayload, contextPayload, mediaPayload } = await getMessageData(msg, wbot);
          await handleMessage(messagePayload, contactPayload, contextPayload, mediaPayload);
          caught += 1;
        }
        checked.set(chat.id._serialized, chat.timestamp);
      } catch (err) {
        failed += 1;
        logger.warn(`Session ${whatsappId}: não consegui conferir uma conversa (${(err as Error).message})`);
      }
    }
    // only a run that looked at everything moves the mark forward; with failures the next one starts from the same point
    if (!failed) syncedAt.set(whatsappId, startedAt);
    if (caught || failed || !opts.periodic) logger.info(`Session ${whatsappId}: recuperadas ${caught} mensagens do tempo em que ficou fora${failed ? ` (${failed} conversas não conferidas, tento de novo)` : ""} em ${Math.round((Date.now() - startedAt) / 1000)}s`);
    if (caught) getIO().emit("whatsappSync", { whatsappId, caught });
  } catch (err) {
    logger.error(err, "Error syncing messages after reconnecting");
  } finally {
    syncing.delete(whatsappId);
  }
};

const removeSession = (whatsappId: number): void => {
  try {
    const sessionIndex = sessions.findIndex(s => s.id === whatsappId);
    if (sessionIndex !== -1) {
      sessions[sessionIndex].destroy().catch(() => undefined);
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
// a number with a long history takes minutes to load WhatsApp Web (it sits at 99% for a while): giving up early restarts the browser and the load begins again
const READY_TIMEOUT_MS = Number(process.env.WHATSAPP_READY_TIMEOUT_MS) || 10 * 60 * 1000;
const readyTimers = new Map<number, NodeJS.Timeout>();
const clearReadyTimer = (whatsappId: number) => {
  const t = readyTimers.get(whatsappId);
  if (t) clearTimeout(t);
  readyTimers.delete(whatsappId);
};
const memoryNote = () => `memória do processo ${Math.round(process.memoryUsage().rss / 1048576)} MB`;

// A number must always be receiving, in real time. Three things keep it so, besides the retries above:
//  1. every browser that was started is remembered until it is closed, so a stuck one is closed before another opens;
//  2. a session that neither shows the QR Code nor becomes ready in a few minutes (the page never loaded) is closed and tried again;
//  3. a heartbeat asks the connected session for its state: one that does not answer (frozen Chromium) is restarted.
// What the watchdog worker needs to know (see workers/WhatsappWatchdog) is exported at the end.
const clients = new Map<number, Session>();
const INIT_TIMEOUT_MS = Number(process.env.WHATSAPP_INIT_TIMEOUT_MS) || 4 * 60 * 1000;
const HEARTBEAT_MS = Number(process.env.WHATSAPP_HEARTBEAT_MS) || 90 * 1000;
const initTimers = new Map<number, NodeJS.Timeout>();
const heartbeats = new Map<number, NodeJS.Timeout>();
// the sessions whose "ready" event came (the page finished injecting): the others are checked by the watchdog
const readySeen = new Set<number>();
const healTried = new Map<number, number>();
const readyNudges = new Map<number, NodeJS.Timeout>();
const retrying = new Set<number>();
const clearInitTimer = (id: number) => {
  const t = initTimers.get(id);
  if (t) clearTimeout(t);
  initTimers.delete(id);
};
const clearHeartbeat = (id: number) => {
  const t = heartbeats.get(id);
  if (t) clearInterval(t);
  heartbeats.delete(id);
};
const closeClient = async (id: number): Promise<void> => {
  clearInitTimer(id);
  clearHeartbeat(id);
  clearReadyTimer(id);
  const c = clients.get(id);
  clients.delete(id);
  readySeen.delete(id);
  syncedAt.delete(id);
  if (c) await Promise.race([c.destroy().catch(() => undefined), new Promise(r => setTimeout(r, 15000))]);
};
// the API is stopping (a new version, a restart): every WhatsApp Web closes properly, so the profile of the browser is not left half written
export const closeAllWwebjsClients = async (): Promise<void> => {
  await Promise.all([...clients.keys()].map(id => closeClient(id).catch(() => undefined)));
};
const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T> => Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);

// the browser of this number is gone or stuck: close it and open it again, slowing down (and finally asking a person) when it keeps failing
const retryLater = async (whatsappId: number, reason: string): Promise<void> => {
  if (retrying.has(whatsappId)) return;
  retrying.add(whatsappId);
  try {
    const row = await Whatsapp.findByPk(whatsappId);
    if (!row) return;
    await closeClient(whatsappId);
    const attempt = (reconnectAttempts.get(whatsappId) || 0) + 1;
    reconnectAttempts.set(whatsappId, attempt);
    if (attempt > RECONNECT_MAX_ATTEMPTS) {
      logger.error(`Session ${row.name}: giving up after ${attempt - 1} attempts (${reason})`);
      await row.update({ status: "DISCONNECTED", qrcode: "" });
      getIO().emit("whatsappSession", { action: "update", session: row });
      getIO().emit("whatsappAlert", { whatsappId, name: row.name, ownerId: row.ownerId, reason });
      return;
    }
    const delay = Math.min(2000 * 2 ** (attempt - 1), 60000);
    logger.warn(`Session ${row.name}: ${reason}. Opening again in ${delay / 1000}s (attempt ${attempt})`);
    await row.update({ status: "OPENING" });
    getIO().emit("whatsappSession", { action: "update", session: row });
    await new Promise(r => setTimeout(r, delay));
  } finally {
    retrying.delete(whatsappId);
  }
  const fresh = await Whatsapp.findByPk(whatsappId);
  if (fresh) init(fresh);
};

// state of the sessions for the watchdog worker
export const sessionWatch = (whatsappId: number): { hasClient: boolean; live: boolean; initializing: boolean } => ({
  hasClient: clients.has(whatsappId),
  live: sessions.some(s => s.id === whatsappId),
  initializing: initTimers.has(whatsappId) || retrying.has(whatsappId) || readyTimers.has(whatsappId)
});

// A number that is delivering messages is connected, whatever the status in the database says. The status can lag behind (a "ready" that never fired after a
// restart, an old "qrcode" event, a change_state of WhatsApp Web) and then the alert "a conexão caiu" contradicts the messages that keep arriving in real time.
// Any event of the page proves it is alive, so the status is put right (at most once a minute per number) and the screens are told.
const aliveAt = new Map<number, number>();
const markAlive = (whatsappId: number): void => {
  const now = Date.now();
  if (now - (aliveAt.get(whatsappId) || 0) < 60000) return;
  aliveAt.set(whatsappId, now);
  Whatsapp.update({ status: "CONNECTED", qrcode: "" }, { where: { id: whatsappId, status: { [Op.ne]: "CONNECTED" } } })
    .then(async ([changed]) => {
      if (!changed) return;
      const row = await Whatsapp.findByPk(whatsappId);
      if (!row) return;
      logger.warn(`Session ${row.name}: recebendo mensagens, mas o status estava desatualizado; marcada como conectada`);
      getIO().emit("whatsappSession", { action: "update", session: row });
    })
    .catch(() => undefined);
};

// What the page of each number looks like from inside: registered for sending, "ready" seen, the state WhatsApp Web reports and whether the helpers of
// whatsapp-web.js are injected in the page (without them nothing can be read or sent, even when the page says CONNECTED). Logged by the watchdog.
export interface SessionHealth { id: number; registered: boolean; ready: boolean; state: string | null; injected: boolean | null }
export const sessionHealth = async (): Promise<SessionHealth[]> => {
  const out: SessionHealth[] = [];
  for (const [id, wbot] of clients) {
    // eslint-disable-next-line no-await-in-loop
    const state = await withTimeout(wbot.getState() as Promise<string>, 15000).catch(() => null);
    // eslint-disable-next-line no-await-in-loop
    const injected = await withTimeout(wbot.pupPage!.evaluate(() => typeof (window as any).WWebJS !== "undefined"), 15000).catch(() => null);
    out.push({ id, registered: sessions.some(s => s.id === id), ready: readySeen.has(id), state: state ? String(state) : null, injected });
    // connected but never "ready": the repair runs (it logs each step)
    if (state === "CONNECTED" && !readySeen.has(id) && !initTimers.has(id) && !retrying.has(id)) healInjection(id, wbot).catch(() => undefined);
  }
  return out;
};

// A page that says CONNECTED but whose "ready" never came cannot read or send anything: the events are not attached. The last steps of the start of
// whatsapp-web.js are done here one by one (each one logged with its error), so the log says which one breaks and the session still comes up when it can.
// Once every 4 minutes per number.
const healInjection = async (id: number, wbot: Session): Promise<void> => {
  if (readySeen.has(id) || Date.now() - (healTried.get(id) || 0) < 4 * 60000) return;
  healTried.set(id, Date.now());
  const page = wbot.pupPage!;
  const step = async (name: string, fn: () => Promise<unknown>): Promise<void> => {
    try {
      await withTimeout(fn(), 60000);
      logger.info(`Session ${id}: [reparo] ${name}: ok`);
    } catch (err) {
      logger.error(`Session ${id}: [reparo] ${name}: falhou: ${String((err as Error)?.message || err).slice(0, 300)}`);
      throw err;
    }
  };
  try {
    const hasUtils = await withTimeout(page.evaluate(() => typeof (window as any).WWebJS !== "undefined"), 15000);
    if (!hasUtils) await step("carregar utilitários", () => page.evaluate(LoadUtils));
    await step("dados da conta", async () => {
      const data = await page.evaluate(() => {
        const w = window as any;
        const me = w.require("WAWebUserPrefsMeUser");
        return { ...w.require("WAWebConnModel").Conn.serialize(), wid: (me.getMaybeMePnUser && me.getMaybeMePnUser()) || (me.getMaybeMeLidUser && me.getMaybeMeLidUser()) || (me.getMeUser && me.getMeUser()) };
      });
      (wbot as any).info = new ClientInfo(wbot as any, data);
    });
    await step("interface", async () => { (wbot as any).interface = new InterfaceController(wbot as any); });
    await step("eventos de mensagem", () => (wbot as any).attachEventListeners());
    logger.warn(`Session ${id}: a página estava conectada sem o "ready"; os recursos foram carregados à mão e o "ready" foi disparado`);
    (wbot as any).emit("ready");
  } catch (err) {
    // what the page offers instead, to know what changed in WhatsApp Web
    const keys = await withTimeout(page.evaluate(() => { const w = window as any; try { return { me: Object.keys(w.require("WAWebUserPrefsMeUser") || {}).slice(0, 40), wwebjs: typeof w.WWebJS, version: w.Debug && w.Debug.VERSION }; } catch (e) { return { erro: String(e) }; } }), 15000).catch(() => null);
    logger.error(`Session ${id}: o reparo não terminou: ${JSON.stringify(keys)}`);
  }
};

// The watchdog asks the page itself (not the database) whether it is connected, and corrects the status when WhatsApp Web says CONNECTED.
export const reconcileStatuses = async (): Promise<void> => {
  for (const [id, wbot] of clients) {
    try {
      if (initTimers.has(id) || retrying.has(id)) continue;
      const row = await Whatsapp.findByPk(id);
      const registered = sessions.some(s => s.id === id);
      if (!row || (row.status === "CONNECTED" && registered)) continue;
      // eslint-disable-next-line no-await-in-loop
      const state = await withTimeout(wbot.getState(), 15000).catch(() => null);
      if (state !== "CONNECTED") continue;
      // the page is connected but the "ready" event never came: the session is alive, so it is registered like a ready one.
      // Without this the watchdog saw "connected but no session here" and opened a SECOND browser on the same profile, which failed and restarted everything.
      if (!registered) {
        wbot.id = id;
        sessions.push(wbot);
      }
      clearReadyTimer(id);
      clearInitTimer(id);
      reconnectAttempts.set(id, 0);
      // eslint-disable-next-line no-await-in-loop
      await healInjection(id, wbot);
      if (row.status !== "CONNECTED") {
        // eslint-disable-next-line no-await-in-loop
        await row.update({ status: "CONNECTED", qrcode: "" });
        logger.warn(`Session ${row.name}: o WhatsApp Web está conectado, mas o status do banco estava desatualizado; corrigido`);
        getIO().emit("whatsappSession", { action: "update", session: row });
      }
    } catch (err) {
      logger.warn(`reconcile of session ${id} failed: ${err}`);
    }
  }
};

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
  if (media.displayName) messageMedia.filename = media.displayName;

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
  ptt: "🎤 Áudio",
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
  // most of the time the message is among the last few: look there first, the long scan is the last resort
  const latest = await chat.fetchMessages({ limit: 60 });
  const quick = latest.find(m => m.id.id === messageId);
  if (quick) return quick;
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
  if (!message || !message.hasMedia) {
    logger.warn(`Media on demand (${messageId}): ${!message ? "the message was not found on the phone's WhatsApp" : "the message carries no file"}`);
    return null;
  }
  let media: any = null;
  try {
    media = await message.downloadMedia();
  } catch (err) {
    logger.warn(`Media on demand (${messageId}) failed: ${(err as Error).message}`);
    return null;
  }
  if (!media) {
    logger.warn(`Media on demand (${messageId}) came back empty: ${await whyNoMedia(message)}`);
    return null;
  }
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
    // a browser that was left behind (stuck, or from a session that never got to "ready") is closed before a new one opens
    await closeClient(whatsapp.id);
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

    clients.set(whatsapp.id, wbot);
    // the page must show the QR Code or become ready: a browser that does neither in a few minutes is stuck
    initTimers.set(
      whatsapp.id,
      setTimeout(() => {
        initTimers.delete(whatsapp.id);
        logger.error(`Session: ${sessionName} não abriu em ${INIT_TIMEOUT_MS / 1000}s (${memoryNote()})`);
        whatsapp.update({ status: "TIMEOUT" }).then(() => getIO().emit("whatsappSession", { action: "update", session: whatsapp })).catch(() => undefined);
        retryLater(whatsapp.id, "a página do WhatsApp não carregou").catch(err => logger.error(err, "retry after a stuck start failed"));
      }, INIT_TIMEOUT_MS)
    );

    wbot.on("qr", async qr => {
      // waiting for someone to read the QR Code is normal: nothing is stuck
      clearInitTimer(whatsapp.id);
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
      // the login was accepted: from here only the "ready" timer (minutes, a long history sits at 99%) may restart the session; the 4-minute start timer used to kill it in the middle of the load
      clearInitTimer(whatsapp.id);
      clearReadyTimer(whatsapp.id);
      // when the page is connected but the library never says "ready", finish the start by hand after 60 s (the watchdog only comes every 3 minutes)
      const nudgeOld = readyNudges.get(whatsapp.id);
      if (nudgeOld) clearTimeout(nudgeOld);
      readyNudges.set(whatsapp.id, setTimeout(() => {
        readyNudges.delete(whatsapp.id);
        if (!readySeen.has(whatsapp.id) && clients.get(whatsapp.id) === wbot) {
          healTried.delete(whatsapp.id);
          healInjection(whatsapp.id, wbot).catch(() => undefined);
        }
      }, 60000));
      readyTimers.set(
        whatsapp.id,
        setTimeout(async () => {
          readyTimers.delete(whatsapp.id);
          logger.error(
            `Session: ${sessionName} não ficou pronta em ${READY_TIMEOUT_MS / 1000}s depois de autenticar (${memoryNote()}). ` +
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
      readySeen.add(whatsapp.id);
      clearReadyTimer(whatsapp.id);
      clearInitTimer(whatsapp.id);
      logger.info(`Session: ${sessionName} READY (${memoryNote()})`);
      reconnectAttempts.set(whatsapp.id, 0);
      // "digitando…" of the lead for the team (best effort: see ChatState.ts)
      watchChatState(wbot, whatsapp.id).catch(() => undefined);
      // heartbeat: a frozen browser does not answer, and then no message would arrive until somebody noticed
      clearHeartbeat(whatsapp.id);
      let missed = 0;
      heartbeats.set(
        whatsapp.id,
        setInterval(async () => {
          try {
            await withTimeout(wbot.getState(), 20000);
            missed = 0;
          } catch (err) {
            missed += 1;
            logger.warn(`Session: ${sessionName} did not answer the heartbeat (${missed}/2): ${(err as Error).message}`);
            if (missed >= 2) {
              clearHeartbeat(whatsapp.id);
              retryLater(whatsapp.id, "a sessão parou de responder").catch(e => logger.error(e, "retry after a frozen session failed"));
            }
          }
        }, HEARTBEAT_MS)
      );

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
        // the catch-up runs in the background (it can take minutes on a big number): the rest of the start does not wait for it
        syncUnreadMessages(wbot, whatsapp.id).catch(() => undefined);
        // and every 5 minutes a light check brings what the live events may have missed (a throttled page, a dropped event)
        const catchUp = setInterval(() => {
          if (clients.get(whatsapp.id) !== wbot) { clearInterval(catchUp); return; }
          syncUnreadMessages(wbot, whatsapp.id, { periodic: true }).catch(() => undefined);
        }, 5 * 60 * 1000);
        if (firstConnection) afterFirstConnection(whatsapp);
        // the communities of this number, a little after WhatsApp Web finished loading and then every 15 minutes
        scheduleCommunitySync(wbot, whatsapp.id, 30000);
        // the pins and pictures as the phone has them: a little after loading, then every 3 minutes
        const chatState = () => syncChatState(wbot, whatsapp.id).catch(err => logger.warn(`chat state sync (${whatsapp.id}) failed: ${err}`));
        setTimeout(chatState, 20000);
        const stateTimer = setInterval(() => {
          if (!sessions.some(x => x.id === whatsapp.id)) { clearInterval(stateTimer); return; }
          chatState();
        }, 3 * 60 * 1000);
        const again = setInterval(() => {
          if (!sessions.some(x => x.id === whatsapp.id)) { clearInterval(again); return; }
          scheduleCommunitySync(wbot, whatsapp.id, 1000);
        }, 15 * 60 * 1000);
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
      clearHeartbeat(whatsapp.id);
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
      markAlive(whatsapp.id);
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

    // a group changed (someone joined, left, a community was linked): look at the communities again
    ["group_join", "group_leave", "group_update", "group_admin_changed"].forEach(evt => wbot.on(evt as any, () => scheduleCommunitySync(wbot, whatsapp.id, 8000)));

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
    // the screen must not stay on "QR CODE" when the browser could not even start: say so, and try again by itself
    try {
      await whatsapp.update({ status: "DISCONNECTED", qrcode: "" });
      getIO().emit("whatsappSession", { action: "update", session: whatsapp });
    } catch (e) {
      logger.error(e, "Error saving the failed session status");
    }
    retryLater(whatsapp.id, "o navegador da sessão não conseguiu iniciar").catch(e => logger.error(e, "retry after a failed start failed"));
  }
};

// deleting or logging out a connection also stops its timers and closes its browser
const removeSessionFully = (whatsappId: number): void => {
  removeSession(whatsappId);
  reconnectAttempts.delete(whatsappId);
  closeClient(whatsappId).catch(() => undefined);
};

export const WhatsappWebJsProvider: WhatsappProvider = {
  init,
  removeSession: removeSessionFully,
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
