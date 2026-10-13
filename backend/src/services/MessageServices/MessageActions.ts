import fs from "fs";
import path from "path";
import { Request } from "express";

import AppError from "../../errors/AppError";
import Message from "../../models/Message";
import Ticket from "../../models/Ticket";
import Whatsapp from "../../models/Whatsapp";
import { getIO } from "../../libs/socket";
import { PUBLIC_DIR } from "../../config/paths";
import { mimeFromName } from "../../helpers/MimeFromName";
import { whatsappProvider } from "../../providers/WhatsApp";
import { getAdapter } from "../../channels";
import { assertTicketAccess } from "../../middleware/canAccessTicket";
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
export const applyReaction = async (id: string, emoji: string, fromMe: boolean, sender: string): Promise<void> => {
  const message = await loadFull(id);
  if (!message) return;
  const next = parse(message).filter(r => !(r.fromMe === fromMe && (r.sender || "") === sender));
  if (emoji) next.push({ emoji, fromMe, sender });
  await message.update({ reactions: next.length ? JSON.stringify(next) : null });
  broadcast(message);
};

export const reactToMessage = async (id: string, emoji: string): Promise<Message> => {
  const message = await loadFull(id);
  if (!message) throw new AppError("ERR_NO_MESSAGE_FOUND", 404);
  const { ticket } = message;
  const channel = ticket.whatsapp?.channel || "whatsapp";

  if (channel === "whatsapp") {
    if (!whatsappProvider.sendReaction) throw new AppError("ERR_REACTION_UNSUPPORTED", 400);
    const chatId = `${ticket.contact.number}@${ticket.isGroup ? "g" : "c"}.us`;
    await whatsappProvider.sendReaction(ticket.whatsappId, chatId, message.id, message.fromMe, emoji);
  } else if (channel === "whatsapp_cloud") {
    const adapter = getAdapter("whatsapp_cloud");
    if (!adapter.sendReaction) throw new AppError("ERR_REACTION_UNSUPPORTED", 400);
    const whatsapp = await Whatsapp.findByPk(ticket.whatsappId);
    await adapter.sendReaction(whatsapp as Whatsapp, ticket.contact as any, message.id, emoji);
  } else {
    throw new AppError("ERR_REACTION_UNSUPPORTED", 400);
  }

  await applyReaction(id, emoji, true, "me");
  return (await loadFull(id)) as Message;
};

// Sends a copy of a message (text or file) into other conversations
export const forwardMessage = async (req: Request, id: string, ticketIds: number[]): Promise<number> => {
  const message = await Message.findByPk(id);
  if (!message || message.isDeleted) throw new AppError("ERR_NO_MESSAGE_FOUND", 404);
  const ids = [...new Set(ticketIds.map(Number))].filter(Boolean).slice(0, 10);
  if (!ids.length) throw new AppError("ERR_FORWARD_NO_TARGET", 400);

  const rawMedia = message.getDataValue("mediaUrl") as string | null;
  const source = rawMedia ? path.join(PUBLIC_DIR, rawMedia) : null;
  if (source && !fs.existsSync(source)) throw new AppError("ERR_MEDIA_NOT_FOUND", 404);

  let sent = 0;
  for (const ticketId of ids) {
    // eslint-disable-next-line no-await-in-loop
    await assertTicketAccess(req, ticketId, "write");
    // eslint-disable-next-line no-await-in-loop
    const ticket = await ShowTicketService(ticketId);
    if (ticket.status === "closed") throw new AppError("ERR_FORWARD_CLOSED_TICKET", 400);
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
