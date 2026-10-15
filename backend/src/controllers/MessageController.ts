import { Request, Response } from "express";

import SetTicketMessagesAsRead from "../helpers/SetTicketMessagesAsRead";
import { getIO } from "../libs/socket";
import { Op } from "sequelize";
import AppError from "../errors/AppError";
import ActivateForSending from "../services/TicketServices/ActivateForSending";
import CreateMessageService from "../services/MessageServices/CreateMessageService";
import { whatsappProvider } from "../providers/WhatsApp";
import { chatIdOf } from "../helpers/ChatId";
import Contact from "../models/Contact";
import { previewOf } from "../helpers/MessagePreview";
import Message from "../models/Message";

import ListMessagesService from "../services/MessageServices/ListMessagesService";
import ShowTicketService from "../services/TicketServices/ShowTicketService";
import DeleteWhatsAppMessage, { EditWhatsAppMessage } from "../services/WbotServices/DeleteWhatsAppMessage";
import SendWhatsAppMedia from "../services/WbotServices/SendWhatsAppMedia";
import SendWhatsAppMessage from "../services/WbotServices/SendWhatsAppMessage";
import { hookHumanReply } from "../services/CrmServices/LeadCore";
import { toggleStar, reactToMessage, forwardMessage, forwardBatch, loadMessageMedia } from "../services/MessageServices/MessageActions";

type IndexQuery = {
  pageNumber: string;
  silent?: string;
};

type MessageData = {
  body: string;
  fromMe: boolean;
  read: boolean;
  quotedMsg?: Message;
};

export const index = async (req: Request, res: Response): Promise<Response> => {
  const { ticketId } = req.params;
  const { pageNumber, silent } = req.query as IndexQuery;

  const { count, messages, ticket, hasMore } = await ListMessagesService({
    pageNumber,
    ticketId
  });

  // opening the conversation marks it read; scrolling back through older pages must not repeat that
  if (!silent && (!pageNumber || Number(pageNumber) <= 1)) SetTicketMessagesAsRead(ticket);

  return res.json({ count, messages, ticket, hasMore });
};

export const store = async (req: Request, res: Response): Promise<Response> => {
  const { ticketId } = req.params;
  const { body, quotedMsg }: MessageData = req.body;
  const medias = req.files as Express.Multer.File[];

  const ticket = await ShowTicketService(ticketId);
  await ActivateForSending(ticket, Number(req.user.id));

  SetTicketMessagesAsRead(ticket);

  if (medias) {
    // one caption per file (the form sends "body" once per media, in order)
    const captions: string[] = ([] as string[]).concat(req.body.body || []);
    // sequential: keeps the order the agent chose and paces unofficial connections
    for (const [i, media] of medias.entries()) {
      const caption = (captions[i] || "").trim();
      // eslint-disable-next-line no-await-in-loop
      await SendWhatsAppMedia({ media, ticket, body: caption || undefined });
    }
  } else {
    await SendWhatsAppMessage({ body, ticket, quotedMsg });
  }

  hookHumanReply(ticket.contactId, Number(req.user.id));

  return res.send();
};

export const remove = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { messageId } = req.params;
  const scope = req.query.scope === "local" ? "local" : "everyone";

  const message = await DeleteWhatsAppMessage(messageId, scope);

  const io = getIO();
  io.to(message.ticketId.toString()).emit("appMessage", {
    action: "update",
    message
  });

  return res.send();
};

export const edit = async (req: Request, res: Response): Promise<Response> => {
  const message = await EditWhatsAppMessage(req.params.messageId, req.body.body);
  getIO().to(message.ticketId.toString()).emit("appMessage", { action: "update", message });
  return res.json({ id: message.id, body: message.body, isEdited: message.isEdited });
};

export const star = async (req: Request, res: Response): Promise<Response> => {
  const message = await toggleStar(req.params.messageId, Boolean(req.body.starred));
  return res.json({ id: message.id, starred: message.starred });
};

export const react = async (req: Request, res: Response): Promise<Response> => {
  const emoji = String(req.body.emoji || "").slice(0, 16);
  const message = await reactToMessage(req.params.messageId, emoji);
  return res.json({ id: message.id, reactions: message.reactions });
};

export const forward = async (req: Request, res: Response): Promise<Response> => {
  const ids = Array.isArray(req.body.ticketIds) ? req.body.ticketIds : [];
  const sent = await forwardMessage(req, req.params.messageId, ids);
  return res.json({ sent });
};

export const forwardMany = async (req: Request, res: Response): Promise<Response> => {
  const messageIds = Array.isArray(req.body.messageIds) ? req.body.messageIds : [];
  const ticketIds = Array.isArray(req.body.ticketIds) ? req.body.ticketIds : [];
  const out = await forwardBatch(req, messageIds, ticketIds);
  return res.status(202).json(out);
};

// What the conversation drawer lists, like WhatsApp's "Mídia, links e docs" and "Mensagens favoritas".
// kind: media (photos and videos) | docs | links | starred
export const listByKind = async (req: Request, res: Response): Promise<Response> => {
  const ticketId = Number(req.params.ticketId);
  const kind = String(req.query.kind || "media");
  const base: any = { ticketId, isDeleted: false };
  const attributes = ["id", "body", "mediaType", "mediaUrl", "fromMe", "createdAt", "starred"];

  if (kind === "links") {
    const rows = await Message.findAll({
      where: { ...base, mediaType: "chat", body: { [Op.iLike]: "%http%" } },
      attributes,
      order: [["createdAt", "DESC"]],
      limit: 300
    });
    const items: any[] = [];
    rows.forEach(m => {
      (String(m.body).match(/https?:\/\/[^\s<>"']+/gi) || []).forEach(url => {
        items.push({ id: m.id, url: url.replace(/[.,;)]+$/, ""), fromMe: m.fromMe, createdAt: m.createdAt });
      });
    });
    return res.json(items.slice(0, 200));
  }

  const where: any =
    kind === "docs"
      ? { ...base, mediaType: "document" }
      : kind === "starred"
      ? { ...base, starred: true }
      : { ...base, mediaType: { [Op.in]: ["image", "video"] } };
  const rows = await Message.findAll({ where, attributes, order: [["createdAt", "DESC"]], limit: 200 });
  return res.json(rows);
};

// "Carregar mídia": brings the file of a message that came without it
export const loadMedia = async (req: Request, res: Response): Promise<Response> => {
  const message = await loadMessageMedia(req.params.messageId);
  return res.json(message);
};

// Sends a poll (WhatsApp only). The phone does not report polls back as messages, so the system keeps its own line.
export const sendPoll = async (req: Request, res: Response): Promise<Response> => {
  const ticket = await ShowTicketService(req.params.ticketId);
  await ActivateForSending(ticket, Number(req.user.id));
  if ((ticket.whatsapp?.channel || "whatsapp") !== "whatsapp" || !whatsappProvider.sendPoll) throw new AppError("ERR_POLL_UNSUPPORTED", 400);
  const title = String(req.body.title || "").trim().slice(0, 140);
  const options: string[] = (Array.isArray(req.body.options) ? req.body.options : [])
    .map((o: any) => String(o || "").trim().slice(0, 80))
    .filter(Boolean);
  if (!title || options.length < 2 || new Set(options).size !== options.length) throw new AppError("ERR_POLL_INVALID", 400);
  if (options.length > 12) throw new AppError("ERR_POLL_INVALID", 400);

  let sent;
  try {
    sent = await whatsappProvider.sendPoll(ticket.whatsappId, chatIdOf(ticket.contact, ticket.isGroup), title, options, Boolean(req.body.multiple));
  } catch (err) {
    throw new AppError("ERR_SENDING_WAPP_MSG");
  }
  const body = `📊 ${title}\n${options.map(o => `▫️ ${o}`).join("\n")}`;
  const message = await CreateMessageService({
    messageData: { id: sent.id, ticketId: ticket.id, body, fromMe: true, read: true, mediaType: "chat", ack: 1 }
  });
  await ticket.update({ lastMessage: `📊 ${title}` });
  return res.status(201).json(message);
};

// Sends a contact card. The card is built here from the contact record and the message is stored at once (the screen
// does not wait for the phone to report it back), without the human-like pause meant for bulk sending.
export const sendContact = async (req: Request, res: Response): Promise<Response> => {
  const ticket = await ShowTicketService(req.params.ticketId);
  await ActivateForSending(ticket, Number(req.user.id));
  if ((ticket.whatsapp?.channel || "whatsapp") !== "whatsapp") throw new AppError("ERR_CONTACT_CARD_UNSUPPORTED", 400);
  const contact = await Contact.findByPk(Number(req.body.contactId), { attributes: ["id", "name", "number", "isGroup"] });
  if (!contact || contact.isGroup || !contact.number || !/^\d{8,15}$/.test(contact.number)) throw new AppError("ERR_NO_CONTACT_FOUND", 404);

  const name = contact.name.replace(/[\r\n]+/g, " ").trim();
  const card = `BEGIN:VCARD\nVERSION:3.0\nFN:${name}\nTEL;type=CELL;waid=${contact.number}:+${contact.number}\nEND:VCARD`;
  let sent;
  try {
    sent = await whatsappProvider.sendMessage(ticket.whatsappId, chatIdOf(ticket.contact, ticket.isGroup), card, { linkPreview: false });
  } catch (err) {
    throw new AppError("ERR_SENDING_WAPP_MSG");
  }
  const message = await CreateMessageService({
    messageData: { id: sent.id, ticketId: ticket.id, body: card, fromMe: true, read: true, mediaType: "vcard", ack: 1 }
  });
  await ticket.update({ lastMessage: previewOf(card, "vcard") });
  return res.status(201).json(message);
};
