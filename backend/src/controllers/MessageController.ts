import { Request, Response } from "express";

import SetTicketMessagesAsRead from "../helpers/SetTicketMessagesAsRead";
import { getIO } from "../libs/socket";
import { Op } from "sequelize";
import Message from "../models/Message";

import ListMessagesService from "../services/MessageServices/ListMessagesService";
import ShowTicketService from "../services/TicketServices/ShowTicketService";
import DeleteWhatsAppMessage, { EditWhatsAppMessage } from "../services/WbotServices/DeleteWhatsAppMessage";
import SendWhatsAppMedia from "../services/WbotServices/SendWhatsAppMedia";
import SendWhatsAppMessage from "../services/WbotServices/SendWhatsAppMessage";
import { hookHumanReply } from "../services/CrmServices/LeadCore";
import { toggleStar, reactToMessage, forwardMessage } from "../services/MessageServices/MessageActions";

type IndexQuery = {
  pageNumber: string;
};

type MessageData = {
  body: string;
  fromMe: boolean;
  read: boolean;
  quotedMsg?: Message;
};

export const index = async (req: Request, res: Response): Promise<Response> => {
  const { ticketId } = req.params;
  const { pageNumber } = req.query as IndexQuery;

  const { count, messages, ticket, hasMore } = await ListMessagesService({
    pageNumber,
    ticketId
  });

  SetTicketMessagesAsRead(ticket);

  return res.json({ count, messages, ticket, hasMore });
};

export const store = async (req: Request, res: Response): Promise<Response> => {
  const { ticketId } = req.params;
  const { body, quotedMsg }: MessageData = req.body;
  const medias = req.files as Express.Multer.File[];

  const ticket = await ShowTicketService(ticketId);

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
