import { Request, Response } from "express";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { publicFile } from "../helpers/PublicFile";
import { asSticker, stickersOf } from "../helpers/Stickers";
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
  // "Criar figurinha": an image the person picked goes as a sticker, like on WhatsApp (512 x 512, transparent around it, .webp)
  if (medias) {
    for (let i = 0; i < medias.length; i += 1) {
      if (kinds[i] === "sticker" && medias[i].mimetype.startsWith("image/")) await asSticker(medias[i]); // eslint-disable-line no-await-in-loop
    }
  }

  const { row, duplicate } = await enqueueOutbound({
    ticketId: Number(ticketId),
    userId: Number(req.user.id),
    clientKey,
    body: medias ? undefined : body,
    quotedMsgId: quotedMsg?.id,
    medias: medias
      ? medias.map((m, i) => ({ path: m.path, filename: m.filename, originalname: m.originalname, mimetype: m.mimetype, size: m.size, caption: (captions[i] || "").trim(), ...(kinds[i] === "gif" && m.mimetype.startsWith("video/") ? { kind: "gif" as const } : kinds[i] === "sticker" && m.mimetype === "image/webp" ? { kind: "sticker" as const } : {}) }))
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
// Shares a contact as a card (QR Code: a vCard the phone shows as a contact; official number: message type "contacts"). Only a contact the
// person may see (one of their leads or conversations, or one nobody works yet); the send goes through the same gate as every other one
// (opt-out, the 24 h window of the official number, the daily limits, the record of the send).
export const sendContact = async (req: Request, res: Response): Promise<Response> => {
  let ticket = await ShowTicketService(req.params.ticketId);
  const channelOf = (t: typeof ticket) => t.whatsapp?.channel || "whatsapp";
  if (!["whatsapp", "whatsapp_cloud"].includes(channelOf(ticket))) throw new AppError("ERR_CONTACT_CARD_UNSUPPORTED", 400);
  const contact = await Contact.findByPk(Number(req.body.contactId), { attributes: ["id", "name", "number", "isGroup"] });
  if (!contact || contact.isGroup || !contact.number || !/^\d{8,15}$/.test(contact.number)) throw new AppError("ERR_NO_CONTACT_FOUND", 404);
  const { hasContactAccessOrFree } = await import("../middleware/canAccessContact");
  if (!(await hasContactAccessOrFree(req, contact.id))) throw new AppError("ERR_NO_PERMISSION", 403);
  ticket = await ActivateForSending(ticket, Number(req.user.id));
  const channel = channelOf(ticket);
  if (!["whatsapp", "whatsapp_cloud"].includes(channel)) throw new AppError("ERR_CONTACT_CARD_UNSUPPORTED", 400);

  const { vcardOf } = await import("../helpers/ContactCards");
  const { deliver } = await import("../services/OutboundServices/Deliver");
  const card = vcardOf(contact.name, contact.number);
  let sent: { id: string };
  try {
    sent = await deliver(ticket, { key: req.body.clientKey ? `contact:${ticket.id}:${String(req.body.clientKey).slice(0, 80)}` : undefined }, async () => {
      if (channel === "whatsapp_cloud") {
        const { getAdapter } = await import("../channels");
        const { default: Whatsapp } = await import("../models/Whatsapp");
        const whatsapp = await Whatsapp.findByPk(ticket.whatsappId);
        const adapter = getAdapter("whatsapp_cloud");
        if (!whatsapp || !adapter.sendContacts) throw new AppError("ERR_CONTACT_CARD_UNSUPPORTED", 400);
        return adapter.sendContacts(whatsapp, ticket.contact as any, { name: contact.name, number: contact.number });
      }
      return whatsappProvider.sendMessage(ticket.whatsappId, chatIdOf(ticket.contact, ticket.isGroup), card, { linkPreview: false });
    });
  } catch (err) {
    // the gate's own answers (window closed, opted out, limits) reach the screen as they are
    if (err instanceof AppError) throw err;
    throw new AppError("ERR_SENDING_WAPP_MSG");
  }
  const message = await CreateMessageService({
    messageData: { id: sent.id, ticketId: ticket.id, body: card, fromMe: true, read: true, mediaType: "vcard", ack: 1 }
  });
  await ticket.update({ lastMessage: previewOf(card, "vcard") });
  return res.status(201).json(message);
};

// THE STICKERS (AND GIFS) OF THE NUMBER: the ones already received and sent in its conversations (WhatsApp Web does not give the
// "favorites" of the phone), newest first and without repeating the same file. Each one says whether the team already sent it (Recentes),
// how many times it went in the conversations (Mais usadas) and whether it only came from clients (Recebidas). ?kind=gif lists the GIFs.
export const stickers = async (req: Request, res: Response): Promise<Response> => {
  const ticket = await ShowTicketService(Number(req.params.ticketId));
  const gif = req.query.kind === "gif";
  const rows = await Message.findAll({
    where: (gif ? { isGif: true, isDeleted: false, mediaUrl: { [Op.ne]: null } } : { mediaType: "image", isDeleted: false, mediaUrl: { [Op.iLike]: "%.webp" } }) as any,
    include: [{ association: "ticket", attributes: [], where: { whatsappId: ticket.whatsappId }, required: true }] as any,
    attributes: ["id", "mediaUrl", "fromMe", "createdAt"],
    order: [["createdAt", "DESC"]],
    limit: 400
  });
  const read: Array<{ id: string; url: string; hash: string; fromMe: boolean; at: number }> = [];
  for (const m of rows) {
    const raw = m.getDataValue("mediaUrl");
    let file: string;
    try { file = publicFile(raw); } catch (_) { continue; }
    if (!fs.existsSync(file)) continue;
    // the same sticker arrives under many names: it is the same when the bytes are the same
    const hash = crypto.createHash("md5").update(fs.readFileSync(file)).digest("hex");
    read.push({ id: m.id, url: m.mediaUrl || "", hash, fromMe: !!m.fromMe, at: new Date(m.createdAt as any).getTime() });
  }
  return res.json(stickersOf(read, gif ? 40 : 60));
};

// Sends one of those stickers as a WhatsApp sticker (a copy of the file goes: the send removes the file it was given)
export const sendSticker = async (req: Request, res: Response): Promise<Response> => {
  const ticketId = Number(req.params.ticketId);
  const ticket = await ShowTicketService(ticketId);
  const source = await Message.findByPk(String(req.body?.messageId || ""), { include: [{ association: "ticket", attributes: ["whatsappId"] }] as any });
  const raw = source ? source.getDataValue("mediaUrl") : null;
  const isGif = !!source?.isGif;
  if (!source || source.isDeleted || !raw || !(isGif || /\.webp$/i.test(raw)) || (source as any).ticket?.whatsappId !== ticket.whatsappId) throw new AppError("ERR_MEDIA_NOT_FOUND", 404);
  const from = publicFile(raw);
  const ext = isGif ? (path.extname(from) || ".mp4") : ".webp";
  const filename = `${isGif ? "gif" : "sticker"}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}${ext}`;
  const to = path.join(path.dirname(from), filename);
  fs.copyFileSync(from, to);
  const { row, duplicate } = await enqueueOutbound({
    ticketId,
    userId: Number(req.user.id),
    clientKey: req.body?.clientKey,
    medias: [isGif
      ? { path: to, filename, originalname: `gif${ext}`, mimetype: "video/mp4", size: fs.statSync(to).size, caption: "", kind: "gif" as const }
      : { path: to, filename, originalname: "figurinha.webp", mimetype: "image/webp", size: fs.statSync(to).size, caption: "", kind: "sticker" as const }]
  });
  if (!duplicate) await processOutbound(row.id).catch(err => logger.error(`Outbound ${row.id}: ${err}`));
  await row.reload();
  return res.status(row.status === "sent" ? 200 : 202).json({ id: row.id, clientKey: row.clientKey, status: row.status, duplicate });
};
