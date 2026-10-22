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
export const applyReaction = async (id: string, emoji: string, fromMe: boolean, sender: string): Promise<Message | null> => {
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
    await announceReaction(message, emoji, sender);
  }
  return message;
};

const announceReaction = async (message: Message, emoji: string, sender: string): Promise<void> => {
  try {
    const { ticket } = message;
    const key = String(sender || "").split("@")[0];
    let who: string | null = null;
    if (ticket.isGroup && key) {
      const person = await Contact.findOne({ where: { [Op.or]: [{ number: key }, { lid: { [Op.like]: `${key}%` } }] } as any, attributes: ["name"] });
      who = person ? person.name : null;
    }
    const raw = previewOf(String(message.body || ""), message.mediaType);
    const labels: Record<string, string> = { image: "📷 Foto", video: "🎥 Vídeo", audio: "🎤 Áudio", document: "📄 Documento" };
    const snippet = (message.mediaUrl && labels[message.mediaType] && (!raw || raw === message.mediaUrl) ? labels[message.mediaType] : raw).replace(/\s+/g, " ").slice(0, 40);
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

  const rawMedia = message.getDataValue("mediaUrl") as string | null;
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
      const caption = message.body && message.body !== rawMedia && !/^\d{10,}\.\w{2,5}$/.test(message.body) ? message.body : "";
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
      await SendWhatsAppMessage({ body: message.body, ticket });
    }
    sent += 1;
  }
  return sent;
};

// Forwards several messages to several conversations. The checks happen now (so a mistake is answered at once); the
// sending itself runs in the background, one queue per connection (the pacing of each number is kept) with the
// different numbers working side by side. The person sees the progress on the screen instead of waiting.
export interface ForwardProgress {
  batchId: string;
  done: number;
  failed: number;
  total: number;
  finished: boolean;
  failedPairs: Array<{ messageId: string; ticketId: number }>;
}

export const forwardBatch = async (req: Request, messageIds: string[], ticketIds: number[]): Promise<{ batchId: string; total: number }> => {
  const mids = [...new Set(messageIds.map(String))].filter(Boolean).slice(0, 50);
  const tids = [...new Set(ticketIds.map(Number))].filter(Boolean).slice(0, 10);
  if (!mids.length) throw new AppError("ERR_NO_MESSAGE_FOUND", 404);
  if (!tids.length) throw new AppError("ERR_FORWARD_NO_TARGET", 400);

  const messages = await Message.findAll({ where: { id: { [Op.in]: mids } } });
  const byId = new Map(messages.map(m => [m.id, m]));
  // keep the order the person selected them in
  const ordered = mids.map(id => byId.get(id)).filter((m): m is Message => !!m && !m.isDeleted);
  if (!ordered.length) throw new AppError("ERR_NO_MESSAGE_FOUND", 404);
  ordered.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  // the person must be allowed to read where the messages come from
  for (const sourceTicketId of [...new Set(ordered.map(m => m.ticketId))]) {
    // eslint-disable-next-line no-await-in-loop
    await assertTicketAccess(req, sourceTicketId, "read");
  }

  const tickets: Ticket[] = [];
  for (const ticketId of tids) {
    // eslint-disable-next-line no-await-in-loop
    await assertTicketAccess(req, ticketId, "write");
    // eslint-disable-next-line no-await-in-loop
    const ticket = await ShowTicketService(ticketId);
    if (ticket.status === "closed") throw new AppError("ERR_FORWARD_CLOSED_TICKET", 400);
    tickets.push(ticket);
  }
  for (const m of ordered) {
    const raw = m.getDataValue("mediaUrl") as string | null;
    if (raw && !fs.existsSync(path.join(PUBLIC_DIR, raw))) throw new AppError("ERR_MEDIA_NOT_FOUND", 404);
  }

  const batchId = `fb${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const total = ordered.length * tickets.length;
  const progress: ForwardProgress = { batchId, done: 0, failed: 0, total, finished: false, failedPairs: [] };
  const userId = Number(req.user.id);
  const tell = (): void => {
    try { getIO().to(`user:${userId}`).emit("forwardProgress", progress); } catch (e) { /* no socket: nobody to tell */ }
  };

  const sendOne = async (message: Message, target: Ticket): Promise<void> => {
    // the same rule as any message a person sends: the first one claims a conversation nobody attends, a conversation of someone else refuses
    const ticket = await ActivateForSending(target, userId);
    const rawMedia = message.getDataValue("mediaUrl") as string | null;
    if (rawMedia) {
      // SendWhatsAppMedia consumes the file it sends: hand it a copy
      const copyName = `fwd-${Date.now()}-${Math.random().toString(36).slice(2, 7)}${path.extname(rawMedia)}`;
      fs.copyFileSync(path.join(PUBLIC_DIR, rawMedia), path.join(PUBLIC_DIR, copyName));
      const caption = message.body && message.body !== rawMedia && !/^\d{10,}\.\w{2,5}$/.test(message.body) ? message.body : "";
      await SendWhatsAppMedia({
        media: { filename: copyName, originalname: rawMedia, mimetype: mimeFromName(rawMedia), path: path.join(PUBLIC_DIR, copyName) } as Express.Multer.File,
        ticket,
        body: caption
      });
    } else {
      await SendWhatsAppMessage({ body: message.body, ticket });
    }
  };

  // one queue per connection: the same number never sends two at once, different numbers do
  const lanes = new Map<number, Ticket[]>();
  tickets.forEach(t => lanes.set(t.whatsappId, [...(lanes.get(t.whatsappId) || []), t]));
  setImmediate(() => {
    tell();
    Promise.all(
      [...lanes.values()].map(async laneTickets => {
        for (const ticket of laneTickets) {
          for (const message of ordered) {
            try {
              // eslint-disable-next-line no-await-in-loop
              await sendOne(message, ticket);
              progress.done += 1;
            } catch (err) {
              logger.warn(`forward batch ${batchId}: message ${message.id} to ticket ${ticket.id} failed: ${(err as Error).message}`);
              progress.failed += 1;
              progress.failedPairs.push({ messageId: message.id, ticketId: ticket.id });
            }
            tell();
          }
        }
      })
    ).then(() => {
      progress.finished = true;
      tell();
    });
  });
  return { batchId, total };
};

// Downloads the file of a message that arrived without it (or that came from the copied history) and attaches it.
export const loadMessageMedia = async (id: string): Promise<Message> => {
  const message = await loadFull(id);
  if (!message) throw new AppError("ERR_NO_MESSAGE_FOUND", 404);
  if (message.getDataValue("mediaUrl")) return message;
  const { ticket } = message;
  if ((ticket.whatsapp?.channel || "whatsapp") !== "whatsapp" || !whatsappProvider.downloadMessageMedia) {
    throw new AppError("ERR_MEDIA_NOT_AVAILABLE", 400);
  }
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
    body: !message.body || label ? media.filename || filename : message.body
  });
  broadcast(message);
  return (await loadFull(id)) as Message;
};
