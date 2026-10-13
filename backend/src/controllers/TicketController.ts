import { Request, Response } from "express";
import { getIO } from "../libs/socket";

import CreateTicketService from "../services/TicketServices/CreateTicketService";
import DeleteTicketService from "../services/TicketServices/DeleteTicketService";
import ListTicketsService from "../services/TicketServices/ListTicketsService";
import ShowTicketService from "../services/TicketServices/ShowTicketService";
import UpdateTicketService from "../services/TicketServices/UpdateTicketService";
import SendWhatsAppMessage from "../services/WbotServices/SendWhatsAppMessage";
import ShowWhatsAppService from "../services/WhatsappService/ShowWhatsAppService";
import formatBody from "../helpers/Mustache";
import TicketEvent from "../models/TicketEvent";
import User from "../models/User";
import Queue from "../models/Queue";
import TicketPin from "../models/TicketPin";
import UserQueue from "../models/UserQueue";
import AppError from "../errors/AppError";
import { roleOf } from "../helpers/Roles";
import { getAdapter } from "../channels";
import { whatsappProvider } from "../providers/WhatsApp";

type IndexQuery = {
  searchParam: string;
  pageNumber: string;
  status: string;
  date: string;
  showAll: string;
  withUnreadMessages: string;
  groups: string;
  queueIds: string;
  tagId: string;
  archived: string;
};

interface TicketData {
  contactId: number;
  status: string;
  queueId: number;
  userId: number;
  note?: string;
  notifyClient?: boolean;
}

export const index = async (req: Request, res: Response): Promise<Response> => {
  const {
    pageNumber,
    status,
    date,
    searchParam,
    showAll,
    queueIds: queueIdsStringified,
    withUnreadMessages,
    groups,
    tagId,
    archived
  } = req.query as IndexQuery;

  const userId = req.user.id;

  let queueIds: number[] = [];

  if (queueIdsStringified) {
    queueIds = JSON.parse(queueIdsStringified);
  }

  // the browser tells which sectors to list: never beyond the ones the person belongs to
  if (roleOf(req.user) !== "admin") {
    const mine = (await UserQueue.findAll({ where: { userId: Number(userId) } })).map(q => q.queueId);
    queueIds = queueIds.filter(id => mine.includes(Number(id)));
  }

  const { tickets, count, hasMore } = await ListTicketsService({
    searchParam,
    pageNumber,
    status,
    date,
    showAll,
    userId,
    queueIds,
    withUnreadMessages,
    groups,
    tagId,
    archived,
    role: roleOf(req.user)
  });

  return res.status(200).json({ tickets, count, hasMore });
};

export const store = async (req: Request, res: Response): Promise<Response> => {
  const { contactId, status, userId }: TicketData = req.body;

  const ticket = await CreateTicketService({ contactId, status, userId });

  const io = getIO();
  io.to(ticket.status).emit("ticket", {
    action: "update",
    ticket
  });

  return res.status(200).json(ticket);
};

export const show = async (req: Request, res: Response): Promise<Response> => {
  const { ticketId } = req.params;

  const ticket = await ShowTicketService(ticketId);
  const pinned = (await TicketPin.count({ where: { ticketId, userId: Number(req.user.id) } })) > 0;

  return res.status(200).json({ ...ticket.toJSON(), pinned });
};

// Pin: personal (each person pins what matters to them)
export const pin = async (req: Request, res: Response): Promise<Response> => {
  const { ticketId } = req.params;
  const userId = Number(req.user.id);
  const wanted = req.body?.pinned !== false;
  const count = await TicketPin.count({ where: { userId } });
  if (wanted) {
    if (count >= 5 && !(await TicketPin.findOne({ where: { userId, ticketId } }))) {
      throw new AppError("ERR_PIN_LIMIT", 400);
    }
    await TicketPin.findOrCreate({ where: { userId, ticketId }, defaults: { userId, ticketId } as any });
  } else {
    await TicketPin.destroy({ where: { userId, ticketId } });
  }
  return res.json({ pinned: wanted });
};

// Archive: leaves the inbox for everyone; a new message from the contact brings it back
export const archive = async (req: Request, res: Response): Promise<Response> => {
  const ticket = await ShowTicketService(req.params.ticketId);
  const archived = req.body?.archived !== false;
  await ticket.update({ archivedAt: archived ? new Date() : null });
  getIO()
    .to(ticket.status)
    .to(String(ticket.id))
    .to("notification")
    .emit("ticket", { action: "update", ticket });
  return res.json({ archived });
};

// The agent started typing: tell the contact where the channel allows it
const typingSent = new Map<number, number>();
export const typing = async (req: Request, res: Response): Promise<Response> => {
  const ticket = await ShowTicketService(req.params.ticketId);
  const last = typingSent.get(ticket.id) || 0;
  if (ticket.isGroup || ticket.status === "closed" || Date.now() - last < 3500) return res.json({ sent: false });
  typingSent.set(ticket.id, Date.now());
  if (typingSent.size > 5000) typingSent.clear();

  const channel = ticket.whatsapp?.channel || "whatsapp";
  try {
    if (channel === "whatsapp") {
      await whatsappProvider.sendTyping?.(ticket.whatsappId, `${ticket.contact.number}@c.us`);
    } else {
      const whatsapp = await ShowWhatsAppService(ticket.whatsappId);
      await getAdapter(channel).sendTyping?.(whatsapp, ticket.contact as any);
    }
  } catch (err) {
    // an indicator is never worth an error on the agent's screen
    return res.json({ sent: false });
  }
  return res.json({ sent: true });
};

export const update = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { ticketId } = req.params;
  const ticketData: TicketData = req.body;

  const { note, notifyClient, ...changes } = ticketData;

  const { ticket } = await UpdateTicketService({
    ticketData: changes,
    ticketId,
    actorId: Number(req.user.id),
    note,
    notifyClient: Boolean(notifyClient)
  });

  if (ticket.status === "closed") {
    const whatsapp = await ShowWhatsAppService(ticket.whatsappId);

    const { farewellMessage } = whatsapp;

    if (farewellMessage) {
      await SendWhatsAppMessage({
        body: formatBody(farewellMessage, ticket.contact),
        ticket,
        automated: true
      });
    }
  }

  return res.status(200).json(ticket);
};

export const remove = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { ticketId } = req.params;

  const ticket = await DeleteTicketService(ticketId);

  const io = getIO();
  io.to(ticket.status).to(ticketId).to("notification").emit("ticket", {
    action: "delete",
    ticketId: +ticketId
  });

  return res.status(200).json({ message: "ticket deleted" });
};

export const events = async (req: Request, res: Response): Promise<Response> => {
  const { ticketId } = req.params;

  const rows = await TicketEvent.findAll({
    where: { ticketId },
    order: [["createdAt", "DESC"]],
    limit: 100,
    include: [
      { model: User, as: "actor", attributes: ["id", "name"] },
      { model: Queue, as: "fromQueue", attributes: ["id", "name", "color"] },
      { model: Queue, as: "toQueue", attributes: ["id", "name", "color"] },
      { model: User, as: "fromUser", attributes: ["id", "name"] },
      { model: User, as: "toUser", attributes: ["id", "name"] }
    ]
  });

  return res.json(rows);
};
