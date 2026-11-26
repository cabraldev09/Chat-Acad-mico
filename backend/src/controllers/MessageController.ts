import { Request, Response } from "express";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { publicFile } from "../helpers/PublicFile";
import { noteSuggestionSent } from "../services/CopilotServices/Feedback";

import SetTicketMessagesAsRead from "../helpers/SetTicketMessagesAsRead";
import { getIO } from "../libs/socket";
import { Op } from "sequelize";
import AppError from "../errors/AppError";
import ActivateForSending from "../services/TicketServices/ActivateForSending";
import { enqueueOutbound, processOutbound } from "../services/MessageServices/OutboundService";
import CreateMessageService from "../services/MessageServices/CreateMessageService";
import { whatsappProvider } from "../providers/WhatsApp";
import { chatIdOf } from "../helpers/ChatId";
import Contact from "../models/Contact";
import { previewOf } from "../helpers/MessagePreview";
import Message from "../models/Message";
import { logger } from "../utils/logger";

import ListMessagesService from "../services/MessageServices/ListMessagesService";
import ShowTicketService from "../services/TicketServices/ShowTicketService";
import DeleteWhatsAppMessage, { EditWhatsAppMessage } from "../services/WbotServices/DeleteWhatsAppMessage";
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

  let { count, messages, ticket, hasMore } = await ListMessagesService({
    pageNumber,
    ticketId
  });
  // scrolling to the top of a conversation of a QR Code number: what is before the oldest message held comes from the phone
  if (!hasMore) {
    const phone = await import("../services/WbotServices/ChatHistoryFromPhone");
    if (Number(pageNumber) > 1 && (await phone.copyChatFromPhone(Number(ticketId), "older")) > 0) {
      ({ count, messages, ticket, hasMore } = await ListMessagesService({ pageNumber, ticketId }));
    }
    // the screen asks for the next page when the person reaches the top: the phone may still have older messages
    if (!hasMore) hasMore = await phone.mayHaveOlder(Number(ticketId)).catch(() => false);
  }

  // opening the conversation marks it read; scrolling back through older pages must not repeat that
  if (!silent && (!pageNumber || Number(pageNumber) <= 1)) SetTicketMessagesAsRead(ticket, Number(req.user.id));

  return res.json({ count, messages, ticket, hasMore });
};

// A person sends: in ONE locked write the sender becomes the attendant (or the send is refused when the conversation is somebody
// else's) and the intention to send is stored. The WhatsApp call is made right after by the outbound worker, once per clientKey.
export const store = async (req: Request, res: Response): Promise<Response> => {
  const { ticketId } = req.params;
  const { body, quotedMsg, clientKey }: MessageData & { clientKey?: string } = req.body;
  const medias = req.files as Express.Multer.File[] | undefined;
  // one caption per file (the form sends "body" once per media, in order)
  const captions: string[] = ([] as string[]).concat(req.body.body || []);
  // how each file goes ("gif" for a short video sent as a GIF; anything else by its type), in the order of the files
  const kinds: string[] = ([] as string[]).concat(req.body.kind || []);

  const { row, duplicate } = await enqueueOutbound({
    ticketId: Number(ticketId),
    userId: Number(req.user.id),
    clientKey,
    body: medias ? undefined : body,
    quotedMsgId: quotedMsg?.id,
    medias: medias
      ? medias.map((m, i) => ({ path: m.path, filename: m.filename, originalname: m.originalname, mimetype: m.mimetype, size: m.size, caption: (captions[i] || "").trim(), ...(kinds[i] === "gif" && m.mimetype.startsWith("video/") ? { kind: "gif" as const } : {}) }))
      : undefined
  });

  // the call to the channel is made right after the commit (never inside the transaction) and answered here, like before: 200 when it left,
  // 202 when it stays queued for another attempt (the worker keeps trying and reports a final failure on the screen). A repeated key sends nothing.
  if (!duplicate) await processOutbound(row.id).catch(err => logger.error(`Outbound ${row.id}: ${err}`));
  // a suggestion of the copilot put in the box: this message says if it went as it was, edited, or was discarded
  if (!duplicate && !medias && body) noteSuggestionSent(Number(ticketId), Number(req.user.id), body).catch(() => undefined);
  await row.reload();
  return res.status(row.status === "sent" ? 200 : 202).json({ id: row.id, clientKey: row.clientKey, status: row.status, duplicate });
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
  const contactIds = Array.isArray(req.body.contactIds) ? req.body.contactIds : [];
  const out = await forwardBatch(req, messageIds, ticketIds, { contactIds, pairs: Array.isArray(req.body.pairs) ? req.body.pairs : undefined, confirmAssume: req.body.confirmAssume === true });
  return res.status(202).json(out);
};

// Where a message can be forwarded (search on the server): open and waiting conversations with the 24 h and "waiting" flags, and
// contacts with no open conversation
export const forwardTargetsIndex = async (req: Request, res: Response): Promise<Response> => {
  const { forwardTargets } = await import("../services/MessageServices/ForwardTargets");
  const page = Math.max(1, Math.min(50, Number(req.query.page) || 1));
  return res.json(await forwardTargets(req, String(req.query.q || ""), page));
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
      // stickers are kept as images (a .webp file) but they are not "media" of the conversation, as in WhatsApp
      : { ...base, mediaType: { [Op.in]: ["image", "video"] }, [Op.and]: [{ [Op.or]: [{ mediaUrl: { [Op.is]: null } }, { mediaUrl: { [Op.notILike]: "%.webp" } }] }] };
  const rows = await Message.findAll({ where, attributes, order: [["createdAt", "DESC"]], limit: 200 });
  return res.json(rows);
};

// "Carregar mídia": brings the file of a message that came without it
// "Dados da mensagem": who received it, who read it and who listened (voice), each with the time, as the phone shows it
export const info = async (req: Request, res: Response): Promise<Response> => {
  const message = await Message.findByPk(req.params.messageId, { attributes: ["id", "ticketId", "fromMe", "ack", "createdAt"] });
  if (!message) throw new AppError("ERR_NO_MESSAGE_FOUND", 404);
  const base = { fromMe: message.fromMe, ack: message.ack, createdAt: message.createdAt };
  if (!message.fromMe) return res.json({ ...base, available: false, reason: "received" });
  const ticket = await ShowTicketService(message.ticketId);
  if ((ticket.whatsapp?.channel || "whatsapp") !== "whatsapp" || !whatsappProvider.getMessageInfo) {
    return res.json({ ...base, available: false, reason: "channel" });
  }
  const found = await whatsappProvider.getMessageInfo(ticket.whatsappId, chatIdOf(ticket.contact, ticket.isGroup), message.id).catch(() => null);
  if (!found) return res.json({ ...base, available: false, reason: "phone" });
  const { withKnownContacts } = await import("../services/ContactServices/KnownPeople");
  const shape = async (list: typeof found.read) => (await withKnownContacts(list)).map(p => ({ id: p.key, name: p.name, number: p.number, contactId: p.contactId, at: p.t ? new Date(p.t * 1000).toISOString() : null }));
  return res.json({
    ...base,
    available: true,
    isGroup: ticket.isGroup,
    read: await shape(found.read),
    played: await shape(found.played),
    // delivered but not read yet (the phone lists them apart)
    delivery: await shape(found.delivery),
    readRemaining: found.readRemaining,
    deliveryRemaining: found.deliveryRemaining,
    playedRemaining: found.playedRemaining
  });
};

export const loadMedia = async (req: Request, res: Response): Promise<Response> => {
  const message = await loadMessageMedia(req.params.messageId);
  return res.json(message);
};

// Sends a poll (WhatsApp only). The phone does not report polls back as messages, so the system keeps its own line.
export const sendPoll = async (req: Request, res: Response): Promise<Response> => {
  let ticket = await ShowTicketService(req.params.ticketId);
  if ((ticket.whatsapp?.channel || "whatsapp") !== "whatsapp" || !whatsappProvider.sendPoll) throw new AppError("ERR_POLL_UNSUPPORTED", 400);
  ticket = await ActivateForSending(ticket, Number(req.user.id));
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
  let ticket = await ShowTicketService(req.params.ticketId);
  if ((ticket.whatsapp?.channel || "whatsapp") !== "whatsapp") throw new AppError("ERR_CONTACT_CARD_UNSUPPORTED", 400);
  ticket = await ActivateForSending(ticket, Number(req.user.id));
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

// THE STICKERS OF THE NUMBER: the ones already received and sent in its conversations (WhatsApp Web does not give the "favorites" of the
// phone), newest first and without repeating the same sticker. The composer shows them in a grid; a tap sends one (sendSticker).
export const stickers = async (req: Request, res: Response): Promise<Response> => {
  const ticket = await ShowTicketService(Number(req.params.ticketId));
  const rows = await Message.findAll({
    where: { mediaType: "image", isDeleted: false, mediaUrl: { [Op.iLike]: "%.webp" } } as any,
    include: [{ association: "ticket", attributes: [], where: { whatsappId: ticket.whatsappId }, required: true }] as any,
    attributes: ["id", "mediaUrl", "createdAt"],
    order: [["createdAt", "DESC"]],
    limit: 300
  });
  const seen = new Set<string>();
  const out: Array<{ id: string; url: string }> = [];
  for (const m of rows) {
    const raw = m.getDataValue("mediaUrl");
    let file: string;
    try { file = publicFile(raw); } catch (_) { continue; }
    // the same sticker arrives under many names: it is the same when the bytes are the same
    const hash = crypto.createHash("md5").update(fs.readFileSync(file)).digest("hex");
    if (seen.has(hash)) continue;
    seen.add(hash);
    out.push({ id: m.id, url: m.mediaUrl || "" });
    if (out.length >= 60) break;
  }
  return res.json(out);
};

// Sends one of those stickers as a WhatsApp sticker (a copy of the file goes: the send removes the file it was given)
export const sendSticker = async (req: Request, res: Response): Promise<Response> => {
  const ticketId = Number(req.params.ticketId);
  const ticket = await ShowTicketService(ticketId);
  const source = await Message.findByPk(String(req.body?.messageId || ""), { include: [{ association: "ticket", attributes: ["whatsappId"] }] as any });
  const raw = source ? source.getDataValue("mediaUrl") : null;
  if (!source || source.isDeleted || !raw || !/\.webp$/i.test(raw) || (source as any).ticket?.whatsappId !== ticket.whatsappId) throw new AppError("ERR_MEDIA_NOT_FOUND", 404);
  const from = publicFile(raw);
  const filename = `sticker-${Date.now()}-${crypto.randomBytes(4).toString("hex")}.webp`;
  const to = path.join(path.dirname(from), filename);
  fs.copyFileSync(from, to);
  const { row, duplicate } = await enqueueOutbound({
    ticketId,
    userId: Number(req.user.id),
    clientKey: req.body?.clientKey,
    medias: [{ path: to, filename, originalname: "figurinha.webp", mimetype: "image/webp", size: fs.statSync(to).size, caption: "", kind: "sticker" }]
  });
  if (!duplicate) await processOutbound(row.id).catch(err => logger.error(`Outbound ${row.id}: ${err}`));
  await row.reload();
  return res.status(row.status === "sent" ? 200 : 202).json({ id: row.id, clientKey: row.clientKey, status: row.status, duplicate });
};
