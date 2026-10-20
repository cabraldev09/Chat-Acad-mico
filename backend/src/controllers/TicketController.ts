import { chatIdOf } from "../helpers/ChatId";
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
import Ticket from "../models/Ticket";
import Whatsapp from "../models/Whatsapp";
import TicketEvent from "../models/TicketEvent";
import User from "../models/User";
import Queue from "../models/Queue";
import TicketPin from "../models/TicketPin";
import UserQueue from "../models/UserQueue";
import AppError from "../errors/AppError";
import ChatFlowRun from "../models/ChatFlowRun";
import Message from "../models/Message";
import RunInboundAutomation from "../services/AutomationServices/RunInboundAutomation";
import { findAgentForTicket } from "../services/AiServices/RunAiAgent";
import { isManagerRole, roleOf } from "../helpers/Roles";
import { getAdapter } from "../channels";
import { whatsappProvider } from "../providers/WhatsApp";
import Contact from "../models/Contact";
import { Op } from "sequelize";

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
  historical: string;
  countOnly: string;
  allQueues: string;
  communities: string;
  attendantId: string;
  connectionId: string;
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
    archived,
    historical,
    countOnly,
    allQueues,
    communities,
    attendantId,
    connectionId
  } = req.query as IndexQuery;

  const userId = req.user.id;

  let queueIds: number[] = [];

  if (queueIdsStringified) {
    try {
      const parsed = JSON.parse(queueIdsStringified);
      queueIds = Array.isArray(parsed) ? parsed.map(Number).filter(Number.isFinite) : [];
    } catch (_) {
      queueIds = [];
    }
  }

  // the browser tells which sectors to list: never beyond the ones the person belongs to
  if (!isManagerRole(roleOf(req.user))) {
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
    historical,
    countOnly: countOnly === "true",
    role: roleOf(req.user),
    allQueues,
    communities,
    attendantId,
    connectionId
  });

  return res.status(200).json({ tickets, count, hasMore });
};

// "Enviar boas-vindas" (tutor): the text the administration wrote, ready to be edited and sent by the tutor. Shown only
// while nobody has answered the student yet.
export const welcome = async (req: Request, res: Response): Promise<Response> => {
  const ticket = await Ticket.findByPk(req.params.ticketId);
  if (!ticket) throw new AppError("ERR_NO_TICKET_FOUND", 404);
  const show = ticket.segment === "onboarding" && ticket.status !== "closed" && !ticket.firstResponseAt && !ticket.isGroup;
  if (!show) return res.json({ show: false, text: "" });
  const { renderWelcome } = await import("../helpers/OnboardingWelcome");
  return res.json({ show: true, text: await renderWelcome(ticket, Number(req.user.id)) });
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
  if (!(await Ticket.findByPk(ticketId, { attributes: ["id"] }))) throw new AppError("ERR_NO_TICKET_FOUND", 404);
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

// The person hands the conversation to the AI agent (it answers the last message at once and goes on from there), or takes it back from it.
// body: { active: boolean }. The conversation goes to Aguardando without an attendant; whoever accepts it later takes it from the agent.
export const ai = async (req: Request, res: Response): Promise<Response> => {
  const ticketId = Number(req.params.ticketId);
  const active = req.body?.active !== false;
  let ticket = await ShowTicketService(String(ticketId));
  if (ticket.isGroup) throw new AppError("ERR_AI_AGENT_NOT_AVAILABLE", 400);
  const actor = await User.findByPk(Number(req.user.id), { attributes: ["name"] });
  const emit = async (): Promise<void> => {
    const fresh = await ShowTicketService(String(ticketId));
    getIO().to(fresh.status).to(String(fresh.id)).to("notification").emit("ticket", { action: "update", ticket: fresh });
  };
  // whatever flow was waiting for an answer is over: the agent starts from the conversation as it is
  await ChatFlowRun.update({ status: "done" }, { where: { ticketId, status: { [Op.in]: ["waiting", "delayed"] } } as any });
  if (!active) {
    await ticket.update({ aiActive: false });
    await TicketEvent.create({ ticketId, type: "handoff", actorId: Number(req.user.id), note: `${actor?.name || "Alguém"} tirou a conversa do agente de IA.` } as any).catch(() => undefined);
    await emit();
    return res.json({ aiActive: false });
  }
  if (!(await findAgentForTicket(ticket))) throw new AppError("ERR_AI_AGENT_NOT_AVAILABLE", 400);
  // a personal number sends every conversation back to its owner at the next message: the agent could not keep it
  const line = await Whatsapp.findByPk(ticket.whatsappId, { attributes: ["id", "ownerId", "aiFirst"] });
  if (line?.ownerId && !line.aiFirst) throw new AppError("ERR_AI_PERSONAL_NUMBER", 400);
  if (ticket.status !== "pending" || ticket.userId) await UpdateTicketService({ ticketData: { status: "pending", userId: null }, ticketId });
  ticket = await ShowTicketService(String(ticketId));
  await ticket.update({ aiActive: true, chatbotNodeId: null, handoffAt: null as any });
  await TicketEvent.create({ ticketId, type: "handoff", actorId: Number(req.user.id), note: `${actor?.name || "Alguém"} passou a conversa para o agente de IA.` } as any).catch(() => undefined);
  await emit();
  // the agent answers the last thing the person said, as if it had just arrived (never makes this request wait) — but only when nobody answered it
  // yet: a second click (or a person who already replied) must not make the agent greet and ask everything again
  const last = await Message.findOne({ where: { ticketId, isDeleted: false } as any, order: [["createdAt", "DESC"]], attributes: ["body", "fromMe"] });
  const unanswered = !!last && !last.fromMe;
  if (unanswered) void RunInboundAutomation({ ticketId, body: String(last?.body || "") });
  return res.json({ aiActive: true, answeredNow: unanswered });
};

// "Mark as unread": the conversation shows the unread badge again until someone opens it
export const markUnread = async (req: Request, res: Response): Promise<Response> => {
  const ticket = await ShowTicketService(req.params.ticketId);
  await ticket.update({ unreadMessages: Math.max(1, ticket.unreadMessages || 0) });
  getIO()
    .to(ticket.status)
    .to(String(ticket.id))
    .to("notification")
    .emit("ticket", { action: "update", ticket });
  return res.json({ unreadMessages: ticket.unreadMessages });
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
      await whatsappProvider.sendTyping?.(ticket.whatsappId, chatIdOf(ticket.contact, false));
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

// Description and members of a group, as the phone shows them (names come from the contacts we already know)
export const groupInfo = async (req: Request, res: Response): Promise<Response> => {
  const ticket = await ShowTicketService(req.params.ticketId);
  if (!ticket.isGroup || !whatsappProvider.getGroupInfo || (ticket.whatsapp?.channel || "whatsapp") !== "whatsapp") {
    return res.json({ participants: [] });
  }
  const info = await whatsappProvider.getGroupInfo(ticket.whatsappId, chatIdOf(ticket.contact, true)).catch(() => null);
  if (!info) return res.json({ participants: [] });

  const raw = info.participants.map(p => ({ ...p, key: p.id.split("@")[0] }));
  const keys = raw.map(p => p.key);
  const known = keys.length
    ? await Contact.findAll({
        where: { [Op.or]: [{ number: { [Op.in]: keys } }, { lid: { [Op.in]: keys } }] } as any,
        attributes: ["id", "name", "number", "lid", "isStaff", "isPersonal", "profilePicUrl"]
      })
    : [];
  const byKey = new Map<string, Contact>();
  known.forEach(c => {
    if (c.number) byKey.set(c.number, c);
    if (c.lid) byKey.set(String(c.lid).split("@")[0], c);
  });

  const participants = raw
    .map(p => {
      const c = byKey.get(p.key);
      return {
        id: p.key,
        contactId: c ? c.id : null,
        name: c ? c.name : null,
        number: c && c.number ? c.number : /^\d{8,15}$/.test(p.key) ? p.key : null,
        isAdmin: p.isAdmin,
        isStaff: c ? c.isStaff : false,
        isPersonal: c ? c.isPersonal : false,
        profilePicUrl: c ? c.profilePicUrl : null
      };
    })
    .sort((a, b) => Number(b.isAdmin) - Number(a.isAdmin) || String(a.name || a.number || "").localeCompare(String(b.name || b.number || "")));

  return res.json({ name: info.name, description: info.description, createdAt: info.createdAt, participants });
};
