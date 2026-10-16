import { afterCommit } from "../helpers/TransactionContext";
import { Request } from "express";
import { Server as SocketIO, Socket } from "socket.io";
import { Server } from "http";
import { decode } from "jsonwebtoken";
import { Op } from "sequelize";
import { corsOrigin } from "../helpers/AllowedOrigins";
import { sessionUser } from "../helpers/SessionUser";
import { isManagerRole } from "../helpers/Roles";
import { maskConfig } from "../helpers/Secrets";
import { assertTicketAccess } from "../middleware/canAccessTicket";
import { assertLead, withLeadScope } from "../middleware/scope";
import Ticket from "../models/Ticket";
import Lead from "../models/Lead";
import Schedule from "../models/Schedule";
import Affiliate from "../models/Affiliate";
import AffiliateBonus from "../models/AffiliateBonus";
import AppError from "../errors/AppError";
import { logger } from "../utils/logger";

let io: SocketIO;
type User = Awaited<ReturnType<typeof sessionUser>>;
const requestOf = (user: User) => ({ user } as Request);

export const disconnectUser = (userId: number): void => {
  if (!io) return;
  io.sockets.sockets.forEach(socket => {
    if (Number(socket.data.user?.id) === userId) {
      socket.emit("authError", { reason: "revoked" });
      socket.disconnect(true);
    }
  });
};

const contactAllowed = async (req: Request, contactId: number): Promise<boolean> => {
  if (isManagerRole(req.user.role)) return true;
  if (await Lead.findOne({ where: await withLeadScope(req, { contactId }), attributes: ["id"] })) return true;
  const tickets = await Ticket.findAll({ where: { contactId }, attributes: ["id"] });
  for (const ticket of tickets) {
    try { await assertTicketAccess(req, ticket.id, "read"); return true; } catch (_) { /* another segment */ }
  }
  return false;
};

// All server events, including chained .to(...), pass through this authorization gate.
export const eventAllowed = async (user: User, event: string, data: any, rooms: string[] = []): Promise<boolean> => {
  const req = requestOf(user);
  const manager = isManagerRole(user.role);
  try {
    if (event === "ticket" || event === "appMessage" || event === "typing") {
      const id = data.ticketId || data.ticket?.id || data.message?.ticketId || rooms.find(r => /^\d+$/.test(r));
      if (!id) return false;
      await assertTicketAccess(req, id, "read");
      return true;
    }
    if (["lead", "payment", "leadAlert", "onboardingAlert", "crmReminder"].includes(event)) {
      const id = data.leadId || data.lead?.id;
      if (!id) return manager;
      await assertLead(req, id);
      return true;
    }
    if (event === "contact") return contactAllowed(req, Number(data.contact?.id || data.contactId));
    if (["whatsapp", "whatsappSession", "whatsappAlert", "safety", "historyImport"].includes(event)) {
      const item = data.session || data.whatsapp || data;
      // the coordination has the same powers as the administration
      return manager || Number(item.ownerId || data.userId) === Number(user.id);
    }
    if (event === "schedule") {
      const row = data.row || await Schedule.findByPk(data.id);
      return !!row && (manager || Number(row.userId) === Number(user.id));
    }
    if (event === "affiliate" || event === "affiliateBonus") {
      if (manager) return true;
      if (user.role !== "consultor") return false;
      let id = data.affiliate?.id || data.affiliateId;
      if (!id && data.bonusId) id = (await AffiliateBonus.findByPk(data.bonusId))?.affiliateId;
      if (!id && data.leadId) id = (await Lead.findByPk(data.leadId))?.affiliateId;
      return !!id && !!(await Affiliate.findOne({ where: { id, ownerId: Number(user.id) }, attributes: ["id"] }));
    }
    if (event === "user") return manager || user.profile === "admin" || Number(data.user?.id || data.userId) === Number(user.id);
    if (event === "contactsImport") return Number(data.userId) === Number(user.id);
    // the return of a curricular analysis is for its owner (the management reads it on the screen)
    if (event === "followUp") return Number(data.userId) === Number(user.id);
    // Settings may contain API credentials. Other users refetch their permitted subset over HTTP.
    if (event === "settings") return manager;
    // progress of what a person forwarded: only they hear it (the room "user:<id>" already limits the delivery)
    if (event === "forwardProgress") return true;
    if (["aiLearning", "flow", "automationTrigger"].includes(event)) return manager;
    if (["campaign", "contactList"].includes(event)) return manager || user.role === "consultor";
    // ids of the conversations pinned on the phone of a number: the lists of everyone who sees that number follow them
    if (["tag", "queue", "quickAnswer", "course", "leadStage", "polo", "ticketPins"].includes(event)) return true;
    return user.profile === "admin";
  } catch (_) { return false; }
};

const send = async (event: string, payload: any, rooms: string[]): Promise<void> => {
  // Serialize once: model toJSON masks CPF, channel credentials and webhook secrets.
  const data = JSON.parse(JSON.stringify(payload));
  const checks = new Map<string, Promise<User>>();
  await Promise.all(Array.from(io.sockets.sockets.values()).map(async socket => {
    if (rooms.length && !rooms.some(room => socket.rooms.has(room))) return;
    const token = socket.data.token;
    if (!checks.has(token)) checks.set(token, sessionUser(token));
    try {
      const user = await checks.get(token) as User;
      if (!(await eventAllowed(user, event, data, rooms))) {
        const id = data.ticket?.id || data.ticketId;
        if (event === "ticket" && id && socket.data.visibleTickets?.has(String(id))) {
          socket.emit("ticket", { action: "delete", ticketId: id });
          socket.data.visibleTickets.delete(String(id));
          socket.leave(String(id));
        }
        return;
      }
      let outgoing = data;
      if (event === "whatsapp" || event === "whatsappSession") {
        const key = event === "whatsapp" ? "whatsapp" : "session";
        const item = data[key];
        if (item) outgoing = { ...data, [key]: { ...item, config: maskConfig(item.config) } };
      }
      const id = data.ticket?.id || data.ticketId || data.message?.ticketId;
      if (id) socket.data.visibleTickets.add(String(id));
      socket.emit(event, outgoing);
    } catch (_) {
      socket.emit("authError", { reason: "revoked" });
      socket.disconnect(true);
    }
  }));
};

interface Emitter { emit(event: string, data: any): boolean; to(room: string | number): Emitter; }
const emitter = (rooms: string[] = []): Emitter => ({
  emit(event, data) {
    afterCommit(() => { send(event, data, rooms).catch(err => logger.error({ err }, "Realtime delivery failed")); });
    return true;
  },
  to(room) { return emitter([...rooms, String(room)]); }
});

export const initIO = (server: Server): SocketIO => {
  io = new SocketIO(server, { cors: { origin: corsOrigin() } });
  io.use(async (socket, next) => {
    try {
      const token = String(socket.handshake.auth?.token || socket.handshake.query.token || "");
      socket.data.user = await sessionUser(token);
      socket.data.token = token;
      socket.data.visibleTickets = new Set<string>();
      next();
    } catch (_) { next(new Error("ERR_SESSION_EXPIRED")); }
  });
  io.on("connection", socket => {
    const claims = decode(socket.data.token) as any;
    const expire = () => { socket.emit("authError", { reason: "expired" }); socket.disconnect(true); };
    const timer = setTimeout(expire, Math.max(1, (claims.exp * 1000) - Date.now()));
    const revalidate = setInterval(() => sessionUser(socket.data.token).catch(expire), 60000);
    socket.on("joinChatBox", async (ticketId: string, ack?: (result: any) => void) => {
      try {
        if (!/^\d+$/.test(String(ticketId))) throw new Error("invalid room");
        const user = await sessionUser(socket.data.token);
        await assertTicketAccess(requestOf(user), ticketId, "read");
        await socket.join(String(ticketId));
        socket.data.visibleTickets.add(String(ticketId));
        if (typeof ack === "function") ack({ ok: true });
      } catch (_) { if (typeof ack === "function") ack({ ok: false }); }
    });
    // a private room for what only this person needs to hear (the progress of what they forwarded)
    socket.join(`user:${socket.data.user.id}`);
    socket.on("joinNotification", () => socket.join("notification"));
    socket.on("joinTickets", (status: string) => {
      if (["open", "pending", "closed"].includes(status)) socket.join(status);
    });
    socket.on("disconnect", () => { clearTimeout(timer); clearInterval(revalidate); });
  });
  return io;
};

export const getIO = (): Emitter => {
  if (!io) throw new AppError("Socket IO not initialized");
  return emitter();
};
