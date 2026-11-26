import { nameOrNotify } from "../../helpers/ParticipantName";
import { forwardBodyOf } from "./ForwardBody";
import { bodyOfMedia } from "../../helpers/MediaLabel";
import { Op } from "sequelize";
import { fire } from "../../helpers/Fire";
import { chatIdOf } from "../../helpers/ChatId";
import { previewOf } from "../../helpers/MessagePreview";
import Contact from "../../models/Contact";
import Tag from "../../models/Tag";
import fs from "fs";
import path from "path";
import { Request } from "express";

import AppError from "../../errors/AppError";
import Message from "../../models/Message";
import Ticket from "../../models/Ticket";
import Whatsapp from "../../models/Whatsapp";
import { getIO } from "../../libs/socket";
import { logger } from "../../utils/logger";
import { PUBLIC_DIR } from "../../config/paths";
import { publicFile } from "../../helpers/PublicFile";
import { mimeFromName } from "../../helpers/MimeFromName";
import { whatsappProvider } from "../../providers/WhatsApp";
import { getAdapter } from "../../channels";
import { assertTicketAccess } from "../../middleware/canAccessTicket";
import ActivateForSending from "../TicketServices/ActivateForSending";
import ShowTicketService from "../TicketServices/ShowTicketService";
import SendWhatsAppMessage from "../WbotServices/SendWhatsAppMessage";
import SendWhatsAppMedia from "../WbotServices/SendWhatsAppMedia";

interface Reaction {
  emoji: string;
  fromMe: boolean;
  sender?: string;
}

const parse = (m: Message): Reaction[] => {
  try {
    return m.reactions ? JSON.parse(m.reactions) : [];
  } catch (e) {
    return [];
  }
};

const loadFull = (id: string) =>
  Message.findByPk(id, {
    include: [
      "contact",
      { model: Message, as: "quotedMsg", include: ["contact"] },
      { model: Ticket, as: "ticket", include: ["contact", { model: Whatsapp, as: "whatsapp", attributes: ["id", "channel"] }] }
    ]
  });

const broadcast = (message: Message): void => {
  getIO().to(String(message.ticketId)).emit("appMessage", { action: "update", message });
};

export const toggleStar = async (id: string, starred: boolean): Promise<Message> => {
  const message = await loadFull(id);
  if (!message) throw new AppError("ERR_NO_MESSAGE_FOUND", 404);
  await message.update({ starred });
  broadcast(message);
  return message;
};

// Stores one reaction per sender (an empty emoji removes it). `sender` is the
// WhatsApp id of the person, or "me" for the agent.
export const applyReaction = async (id: string, emoji: string, fromMe: boolean, sender: string, shownName: string | null = null): Promise<Message | null> => {
  const message = await loadFull(id);
  if (!message) return null;
  // my own reaction comes back from WhatsApp with my phone id: it is the same person as "me", never a second reaction
  if (fromMe) sender = "me";
  const next = parse(message).filter(r => !(r.fromMe === fromMe && (r.sender || "") === sender));
  if (emoji) next.push({ emoji, fromMe, sender });
  const stored = next.length ? JSON.stringify(next) : null;
  // the echo of a reaction that is already saved changes nothing: no write, no broadcast
  if ((message.reactions || null) === stored) return message;
  await message.update({ reactions: stored });
  broadcast(message);

  // somebody reacted to a message: the list says so ("Reagiu com ❤️ a “texto”") without opening the conversation
  if (emoji && !fromMe && message.ticket) {
    fire("message.reaction", { ticketId: message.ticket.id, contactId: message.ticket.contactId, emoji });
    await announceReaction(message, emoji, sender, shownName);
  }
  return message;
};

const announceReaction = async (message: Message, emoji: string, sender: string, shownName: string | null = null): Promise<void> => {
  try {
    const { ticket } = message;
    const key = String(sender || "").split("@")[0];
    let who: string | null = null;
    if (ticket.isGroup && key) {
      const person = await Contact.findOne({ where: { [Op.or]: [{ number: key }, { lid: { [Op.like]: `${key}%` } }] } as any, attributes: ["name"] });
      // the contact stored here; a placeholder (the number) or no contact gives way to the name the person shows on WhatsApp
      who = person ? nameOrNotify({ name: person.name, number: key }, shownName) : shownName;
      if (who === "Participante") who = null;
    }
    const raw = previewOf(String(message.body || ""), message.mediaType);
    const labels: Record<string, string> = { document: "📄 Documento" };
    const named = message.mediaUrl && ["image", "video", "audio"].includes(message.mediaType) ? bodyOfMedia(raw, message.mediaType, message.mediaUrl) : null;
    const snippet = (named || (message.mediaUrl && labels[message.mediaType] && (!raw || raw === message.mediaUrl) ? labels[message.mediaType] : raw)).replace(/\s+/g, " ").slice(0, 40);
    await Ticket.update(
      {
        lastMessage: `Reagiu com ${emoji} a “${snippet}”`,
        lastMessageType: "reaction",
        lastMessageFromMe: false,
        lastMessageAuthor: who,
        lastMessageAt: new Date(),
        unreadMessages: (ticket.unreadMessages || 0) + 1
      } as any,
      { where: { id: ticket.id }, silent: true } as any
    );
    const fresh = await Ticket.findByPk(ticket.id, {
      include: [
        "contact",
        "queue",
        { model: Tag, as: "tags", attributes: ["id", "name", "color"], through: { attributes: [] } },
        { model: Whatsapp, as: "whatsapp", attributes: ["name", "channel"] }
      ]
    });
    if (fresh) getIO().to(fresh.status).to(String(fresh.id)).to("notification").emit("ticket", { action: "update", ticket: fresh });
  } catch (err) {
    // the preview is a courtesy: the reaction itself is already saved
  }
};

export const reactToMessage = async (id: string, emoji: string): Promise<Message> => {
  const message = await loadFull(id);
  if (!message) throw new AppError("ERR_NO_MESSAGE_FOUND", 404);
  const { ticket } = message;
  const channel = ticket.whatsapp?.channel || "whatsapp";

  const deliver = async (): Promise<void> => {
    if (channel === "whatsapp") {
      if (!whatsappProvider.sendReaction) throw new AppError("ERR_REACTION_UNSUPPORTED", 400);
      const chatId = chatIdOf(ticket.contact, ticket.isGroup);
      try {
        await whatsappProvider.sendReaction(ticket.whatsappId, chatId, message.id, message.fromMe, emoji);
      } catch (err) {
        // whatever the phone side threw, the person gets a readable answer instead of "Erro interno"
        if (err instanceof AppError) throw err;
        throw new AppError("ERR_REACTION_FAILED", 400);
      }
    } else {
      // Cloud API, Telegram, Messenger, Instagram: through the channel adapter
      const adapter = getAdapter(channel);
      if (!adapter.sendReaction) throw new AppError("ERR_REACTION_UNSUPPORTED", 400);
      const whatsapp = await Whatsapp.findByPk(ticket.whatsappId);
      try {
        await adapter.sendReaction(whatsapp as Whatsapp, ticket.contact as any, message.id, emoji);
      } catch (err) {
        if (err instanceof AppError) throw err;
        throw new AppError("ERR_REACTION_FAILED", 400);
      }
    }
  };

  // the reaction shows on every screen right away while the phone is told; if the phone refuses, it is taken back
  const previous = message.reactions || null;
  const [, sent] = await Promise.all([applyReaction(id, emoji, true, "me"), deliver().then(() => null, (err: Error) => err)]);
  if (sent) {
    await Message.update({ reactions: previous } as any, { where: { id } });
    const fresh = await loadFull(id);
    if (fresh) broadcast(fresh);
    throw sent;
  }
  return (await Message.findByPk(id)) as Message;
};

// Sends a copy of a message (text or file) into other conversations
export const forwardMessage = async (req: Request, id: string, ticketIds: number[]): Promise<number> => {
  const message = await Message.findByPk(id);
  if (!message || message.isDeleted) throw new AppError("ERR_NO_MESSAGE_FOUND", 404);
  const ids = [...new Set(ticketIds.map(Number))].filter(Boolean).slice(0, 10);
  if (!ids.length) throw new AppError("ERR_FORWARD_NO_TARGET", 400);

  // a location goes as its description and map link, a file never downloaded (or removed) is refused with the reason
  const what = forwardBodyOf({ ...message.get({ plain: true }), mediaUrl: message.getDataValue("mediaUrl") as string | null });
  if (!what.ok) throw new AppError(what.reason, what.reason === "ERR_NO_MESSAGE_FOUND" ? 404 : 400);
  const rawMedia = what.media;
  const source = rawMedia ? publicFile(rawMedia) : null;
  if (source && !fs.existsSync(source)) throw new AppError("ERR_MEDIA_NOT_FOUND", 404);

  let sent = 0;
  for (const ticketId of ids) {
    // eslint-disable-next-line no-await-in-loop
    await assertTicketAccess(req, ticketId, "send");
    // eslint-disable-next-line no-await-in-loop
    let ticket = await ShowTicketService(ticketId);
    if (ticket.status === "closed") throw new AppError("ERR_FORWARD_CLOSED_TICKET", 400);
    // forwarding is a person writing in that conversation: it becomes theirs if nobody had it, and it is refused if somebody else has it
    // eslint-disable-next-line no-await-in-loop
    ticket = await ActivateForSending(ticket, Number(req.user.id));
    if (source && rawMedia) {
      // SendWhatsAppMedia consumes the file it sends: hand it a copy
      const copyName = `fwd-${Date.now()}-${Math.random().toString(36).slice(2, 7)}${path.extname(rawMedia)}`;
      fs.copyFileSync(source, path.join(PUBLIC_DIR, copyName));
      const caption = what.body;
      // eslint-disable-next-line no-await-in-loop
      await SendWhatsAppMedia({
        media: {
          filename: copyName,
          originalname: rawMedia,
          mimetype: mimeFromName(rawMedia),
          path: path.join(PUBLIC_DIR, copyName)
        } as Express.Multer.File,
        ticket,
        body: caption
      });
    } else {
      // eslint-disable-next-line no-await-in-loop
      await SendWhatsAppMessage({ body: what.body, ticket });
    }
    sent += 1;
  }
  return sent;
};

// Forwards several messages to several conversations. The checks happen now (so a mistake is answered at once): who may send there,
// the 24 h window of the official number, and the conversations waiting for an attendant (the person confirms they take them). A
// contact with no open conversation gets one (the same as "Nova conversa"). The sending runs in the background, one queue per
// connection, with the progress on the screen; each pair that does not go says why, and "Tentar de novo" sends only those.
// Between two chats of the same number by QR Code the phone forwards it itself ("Encaminhada", no new upload).
export interface ForwardProgress {
  batchId: string;
  done: number;
  failed: number;
  total: number;
  finished: boolean;
  // each pair that did not go, with the reason (an error code the screen translates) and who it was for
  failedPairs: Array<{ messageId: string; ticketId: number; reason?: string; name?: string }>;
}

export interface ForwardBatchOptions {
  contactIds?: number[];
  pairs?: Array<{ messageId: string; ticketId: number }>;
  confirmAssume?: boolean;
}

const planOf = (m: Message) => forwardBodyOf({ ...m.get({ plain: true }), mediaUrl: m.getDataValue("mediaUrl") as string | null });

export const forwardBatch = async (req: Request, messageIds: string[], ticketIds: number[], options: ForwardBatchOptions = {}): Promise<{ batchId: string; total: number; opened: number[] }> => {
  const { retryPairs, nativeForwardable } = await import("./ForwardPlan");
  const pairs = options.pairs ? retryPairs(options.pairs) : [];
  const mids = (pairs.length ? [...new Set(pairs.map(p => p.messageId))] : [...new Set(messageIds.map(String))].filter(Boolean)).slice(0, 50);
  const tids = (pairs.length ? [...new Set(pairs.map(p => p.ticketId))] : [...new Set(ticketIds.map(Number))].filter(Boolean)).slice(0, 10);
  const contactIds = pairs.length ? [] : [...new Set((options.contactIds || []).map(Number))].filter(Boolean).slice(0, 10);
  if (!mids.length) throw new AppError("ERR_NO_MESSAGE_FOUND", 404);
  if (!tids.length && !contactIds.length) throw new AppError("ERR_FORWARD_NO_TARGET", 400);
  if (tids.length + contactIds.length > 10) throw new AppError("ERR_FORWARD_TOO_MANY_TARGETS", 400);

  const messages = await Message.findAll({ where: { id: { [Op.in]: mids } } });
  const byId = new Map(messages.map(m => [m.id, m]));
  // keep the order the person selected them in
  const ordered = mids.map(id => byId.get(id)).filter((m): m is Message => !!m && !m.isDeleted);
  if (!ordered.length) throw new AppError("ERR_NO_MESSAGE_FOUND", 404);
  ordered.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  // the person must be allowed to read where the messages come from
  const sources = new Map<number, Ticket>();
  for (const sourceTicketId of [...new Set(ordered.map(m => m.ticketId))]) {
    // eslint-disable-next-line no-await-in-loop
    await assertTicketAccess(req, sourceTicketId, "read");
    // eslint-disable-next-line no-await-in-loop
    sources.set(sourceTicketId, await ShowTicketService(sourceTicketId));
  }

  const tickets: Ticket[] = [];
  for (const ticketId of tids) {
    // the same rule as writing in that conversation (the tutor's, the attendant's): sending, not only reading
    // eslint-disable-next-line no-await-in-loop
    await assertTicketAccess(req, ticketId, "send");
    // eslint-disable-next-line no-await-in-loop
    const ticket = await ShowTicketService(ticketId);
    if (ticket.status === "closed") throw new AppError("ERR_FORWARD_CLOSED_TICKET", 400);
    tickets.push(ticket);
  }
  for (const m of ordered) {
    const raw = m.getDataValue("mediaUrl") as string | null;
    if (raw && !fs.existsSync(path.join(PUBLIC_DIR, raw))) throw new AppError("ERR_MEDIA_NOT_FOUND", 404);
  }
  // what each one sends; one that cannot go counts as a failure with its reason, and when none can go the person is answered at once
  const plan = new Map(ordered.map(m => [m.id, planOf(m)]));
  const first = [...plan.values()].find(p => !p.ok);
  if (first && !first.ok && [...plan.values()].every(p => !p.ok)) throw new AppError(first.reason, 400);

  // checked before anything goes: the 24 h window of the official number (outside it, only a model may go) ...
  const { forwardFlags } = await import("./ForwardTargets");
  const flags = await forwardFlags(tickets, Number(req.user.id));
  const closed = tickets.filter(t => flags.get(t.id)?.windowClosed);
  if (closed.length && !pairs.length) {
    throw new AppError("ERR_FORWARD_WINDOW_CLOSED", 409, { ticketIds: closed.map(t => t.id), names: closed.map(t => (t.contact && t.contact.name) || "") });
  }
  // ... and the conversations waiting for an attendant: forwarding there takes them, which the person confirms first
  const waiting = tickets.filter(t => flags.get(t.id)?.waiting);
  if (waiting.length && !options.confirmAssume) {
    throw new AppError("ERR_FORWARD_CONFIRM_ASSUME", 409, { count: waiting.length, ticketIds: waiting.map(t => t.id) });
  }

  // a contact with no open conversation: the conversation is opened for the person, as "Nova conversa" does, on their number
  const opened: number[] = [];
  if (contactIds.length) {
    const { connectionScopeOf, contactScopeWhere } = await import("../../helpers/ConnectionScope");
    const { roleOf } = await import("../../helpers/Roles");
    const scope = await connectionScopeOf(req.user.id, roleOf(req.user));
    const scoped = contactScopeWhere(scope, req.user.id);
    const { default: CreateTicketService } = await import("../TicketServices/CreateTicketService");
    const { default: GetDefaultWhatsApp } = await import("../../helpers/GetDefaultWhatsApp");
    const { lastInboundAt } = await import("../OutboundServices/LastInbound");
    const { inMessagingWindow } = await import("../OutboundServices/Policy");
    const number = await GetDefaultWhatsApp(Number(req.user.id));
    const found: Contact[] = [];
    for (const contactId of contactIds) {
      // eslint-disable-next-line no-await-in-loop
      const contact = await Contact.findOne({ where: scoped ? { [Op.and]: [{ id: contactId, isGroup: false }, scoped] } : { id: contactId, isGroup: false } } as any);
      if (!contact) throw new AppError("ERR_NO_CONTACT_FOUND", 404);
      found.push(contact);
    }
    // the new conversation is on the person's number: on the official one, outside the 24 h, nothing but a model could go
    if (["whatsapp_cloud", "instagram", "messenger"].includes(number.channel || "")) {
      const outside: Contact[] = [];
      for (const contact of found) {
        // eslint-disable-next-line no-await-in-loop
        if (!inMessagingWindow(number.channel, await lastInboundAt(contact.id, number.id))) outside.push(contact);
      }
      if (outside.length) throw new AppError("ERR_FORWARD_WINDOW_CLOSED", 409, { contactIds: outside.map(c => c.id), names: outside.map(c => c.name || "") });
    }
    for (const { id: contactId } of found) {
      // eslint-disable-next-line no-await-in-loop
      const created = await CreateTicketService({ contactId, status: "open", userId: Number(req.user.id) } as any);
      opened.push(created.id);
      // eslint-disable-next-line no-await-in-loop
      tickets.push(await ShowTicketService(created.id));
    }
  }

  const work: Array<{ message: Message; ticket: Ticket }> = [];
  if (pairs.length) {
    const ticketById = new Map(tickets.map(t => [t.id, t]));
    pairs.forEach(p => { const message = byId.get(p.messageId); const ticket = ticketById.get(p.ticketId); if (message && ticket && !message.isDeleted) work.push({ message, ticket }); });
  } else {
    tickets.forEach(ticket => ordered.forEach(message => work.push({ message, ticket })));
  }

  const batchId = `fb${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const total = work.length;
  const progress: ForwardProgress = { batchId, done: 0, failed: 0, total, finished: false, failedPairs: [] };
  const userId = Number(req.user.id);
  const tell = (): void => {
    try { getIO().to(`user:${userId}`).emit("forwardProgress", progress); } catch (e) { /* no socket: nobody to tell */ }
  };

  const resend = async (message: Message, ticket: Ticket, what: { body: string; media: string | null }): Promise<void> => {
    if (what.media) {
      // SendWhatsAppMedia consumes the file it sends: hand it a copy
      const copyName = `fwd-${Date.now()}-${Math.random().toString(36).slice(2, 7)}${path.extname(what.media)}`;
      fs.copyFileSync(path.join(PUBLIC_DIR, what.media), path.join(PUBLIC_DIR, copyName));
      await SendWhatsAppMedia({
        media: { filename: copyName, originalname: what.media, mimetype: mimeFromName(what.media), path: path.join(PUBLIC_DIR, copyName) } as Express.Multer.File,
        ticket,
        body: what.body
      });
    } else {
      await SendWhatsAppMessage({ body: what.body, ticket });
    }
  };

  // the phone forwards it ("Encaminhada"): the copy is stored here at once when its id is found (else it arrives by the connection)
  const native = async (message: Message, source: Ticket, ticket: Ticket, what: { body: string; media: string | null }): Promise<boolean> => {
    const { deliver } = await import("../OutboundServices/Deliver");
    let found: { id: string | null } | null = null;
    try {
      found = await deliver(ticket, {}, async () => {
        const r = await whatsappProvider.forwardMessage!(source.whatsappId, chatIdOf(source.contact, source.isGroup), message.id, message.fromMe, chatIdOf(ticket.contact, ticket.isGroup));
        // not on the phone: nothing went, the copy is sent the usual way
        if (!r) throw new AppError("ERR_PROVIDER_REFUSED", 409);
        return { id: r.id || `fwd-native-${message.id}-${ticket.id}`, stored: !!r.id } as any;
      });
    } catch (err) {
      if (err instanceof AppError && err.message === "ERR_PROVIDER_REFUSED") return false;
      throw err;
    }
    if (found && (found as any).stored && found.id) {
      let mediaUrl: string | undefined;
      if (what.media) {
        const copyName = `fwd-${Date.now()}-${Math.random().toString(36).slice(2, 7)}${path.extname(what.media)}`;
        try { fs.copyFileSync(path.join(PUBLIC_DIR, what.media), path.join(PUBLIC_DIR, copyName)); mediaUrl = copyName; } catch (e) { /* the screen shows the placeholder */ }
      }
      const { default: CreateMessageService } = await import("./CreateMessageService");
      await CreateMessageService({ messageData: { id: found.id, ticketId: ticket.id, body: what.body || (message.body || ""), fromMe: true, read: true, mediaType: message.mediaType, mediaUrl, ack: 1, isForwarded: true } });
      await ticket.update({ lastMessage: previewOf(what.body || message.body || "") }).catch(() => undefined);
    }
    return true;
  };

  const sendOne = async (message: Message, target: Ticket): Promise<void> => {
    const what = plan.get(message.id);
    if (!what || !what.ok) throw new AppError(what && !what.ok ? what.reason : "ERR_NO_MESSAGE_FOUND", 400);
    // the same rule as any message a person sends: the first one claims a conversation nobody attends, a conversation of someone else refuses
    const ticket = await ActivateForSending(target, userId);
    const source = sources.get(message.ticketId);
    const canNative = !!source && nativeForwardable(
      { whatsappId: source.whatsappId, channel: source.whatsapp?.channel },
      { whatsappId: ticket.whatsappId, channel: ticket.whatsapp?.channel },
      typeof whatsappProvider.forwardMessage === "function"
    );
    if (canNative && source && (await native(message, source, ticket, what))) return;
    await resend(message, ticket, what);
  };

  // one queue per connection: the same number never sends two at once, different numbers do
  const lanes = new Map<number, Array<{ message: Message; ticket: Ticket }>>();
  work.forEach(w => lanes.set(w.ticket.whatsappId, [...(lanes.get(w.ticket.whatsappId) || []), w]));
  setImmediate(() => {
    tell();
    Promise.all(
      [...lanes.values()].map(async lane => {
        for (const { message, ticket } of lane) {
          try {
            // eslint-disable-next-line no-await-in-loop
            await sendOne(message, ticket);
            progress.done += 1;
          } catch (err) {
            logger.warn(`forward batch ${batchId}: message ${message.id} to ticket ${ticket.id} failed: ${(err as Error).message}`);
            progress.failed += 1;
            const reason = err instanceof AppError ? String(err.message) : "ERR_SENDING_WAPP_MSG";
            progress.failedPairs.push({ messageId: message.id, ticketId: ticket.id, reason, name: (ticket.contact && ticket.contact.name) || "" });
          }
          tell();
        }
      })
    ).then(() => {
      progress.finished = true;
      tell();
    });
  });
  return { batchId, total, opened };
};

// Downloads the file of a message that arrived without it (or that came from the copied history) and attaches it.
export const loadMessageMedia = async (id: string): Promise<Message> => {
  const message = await loadFull(id);
  if (!message) throw new AppError("ERR_NO_MESSAGE_FOUND", 404);
  if (message.getDataValue("mediaUrl")) return message;
  // the retention policy deleted this file on purpose: it is not brought back from the phone
  if (message.mediaPurgedAt || message.bodyPurgedAt) throw new AppError("ERR_MEDIA_PURGED", 410);
  const { ticket } = message;
  if ((ticket.whatsapp?.channel || "whatsapp") !== "whatsapp" || !whatsappProvider.downloadMessageMedia) {
    throw new AppError("ERR_MEDIA_NOT_AVAILABLE", 400);
  }
  // WhatsApp keeps a file on its servers for a limited time (about two months): an older one cannot be downloaded any more, whoever tries
  if (Date.now() - new Date(message.createdAt).getTime() > 60 * 86400000) throw new AppError("ERR_MEDIA_EXPIRED", 410);
  const chatId = chatIdOf(ticket.contact, ticket.isGroup);
  const media = await whatsappProvider
    .downloadMessageMedia(ticket.whatsappId, chatId, message.id, message.fromMe)
    .catch(() => null);
  if (!media) throw new AppError("ERR_MEDIA_NOT_AVAILABLE", 404);

  const { saveMediaFile } = await import("../../handlers/handleWhatsappEvents");
  const filename = await saveMediaFile({ filename: media.filename, mimetype: media.mimetype, data: media.data });
  const [kind] = media.mimetype.split("/");
  const label = /^[\p{Extended_Pictographic}\s]*(Imagem|Vídeo|Áudio|Mensagem de voz|Documento|Figurinha)$/u.test(message.body || "");
  await message.update({
    mediaUrl: filename,
    mediaType: kind === "application" ? "document" : kind,
    isGif: !!media.isGif,
    // the label placed by the history copy gives way to the file name
    body: kind === "application" ? (!message.body || label ? media.filename || filename : message.body) : bodyOfMedia(label ? "" : message.body, kind, filename, media.filename, media.mimetype)
  });
  broadcast(message);
  return (await loadFull(id)) as Message;
};
