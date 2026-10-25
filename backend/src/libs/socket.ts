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
import { assertLead } from "../middleware/scope";
import { hasContactAccess } from "../middleware/canAccessContact";
import Ticket from "../models/Ticket";
import Lead from "../models/Lead";
import Schedule from "../models/Schedule";
import UserQueue from "../models/UserQueue";
import { remember } from "../helpers/TtlCache";
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

const contactAllowed = (req: Request, contactId: number): Promise<boolean> => hasContactAccess(req, contactId);

const inQueue = async (userId: number | string, queueId: number | string): Promise<boolean> =>
  !!(await UserQueue.findOne({ where: { userId: Number(userId), queueId: Number(queueId) }, attributes: ["userId"] }));

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
    if (["lead", "payment", "leadAlert", "onboardingAlert", "onboardingReminder", "crmReminder"].includes(event)) {
      const id = data.leadId || data.lead?.id;
      if (!id) return manager;
      await assertLead(req, id);
      return true;
    }
    // the conversation the AI agent handed over, and the alert that nobody answered it: the person it was given to, the management and, while
    // it waits in a queue with nobody assigned, the consultors of that queue (the commercial team of the polo)
    if (event === "aiHandoff" || event === "handoffAlert") {
      if (manager || Number(data.userId) === Number(user.id)) return true;
      return !data.userId && !!data.queueId && user.role === "consultor" && (await inQueue(user.id, data.queueId));
    }
    // the dissatisfied student of the survey: the tutor and the consultant of that student, and the management
    if (event === "npsAlert") return manager || Number(data.tutorId) === Number(user.id) || Number(data.ownerId) === Number(user.id);
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
    if (event === "followUp" || event === "taskAssigned" || event === "onboardingAssigned") return Number(data.userId) === Number(user.id);
    // a student entered the risk of dropping out: the tutor, the consultant of the student and the management
    if (event === "riskAlert") return manager || Number(data.tutorId) === Number(user.id) || Number(data.ownerId) === Number(user.id);
    // Settings may contain API credentials. Other users refetch their permitted subset over HTTP.
    if (event === "settings") return manager;
    // progress of what a person forwarded: only they hear it (the room "user:<id>" already limits the delivery)
    if (event === "forwardProgress" || event === "outboundMessage") return true;
    // "numbers changed" signal: the person themselves and whoever may see that consultant (no numbers travel in it)
    if (event === "analytics") {
      const target = Number(data.userId);
      if (target === Number(user.id)) return true;
      if (!manager) return false;
      const { canSeeConsultant } = await import("../services/AnalyticsServices/AnalyticsService");
      return canSeeConsultant(user, target);
    }
    if (["aiLearning", "flow", "automationTrigger"].includes(event)) return manager;
    if (["campaign", "contactList"].includes(event)) return manager || user.role === "consultor";
    // ids of the conversations pinned on the phone of a number: the lists of everyone who sees that number follow them
    if (["tag", "queue", "quickAnswer", "course", "leadStage", "polo", "ticketPins"].includes(event)) return true;
    // the rest (lists of settings screens, institution, templates...) are for the administration and the coordination
    return manager;
  } catch (_) { return false; }
};

const send = async (event: string, payload: any, rooms: string[]): Promise<void> => {
  // Serialize once: model toJSON masks CPF, channel credentials and webhook secrets.
  const data = JSON.parse(JSON.stringify(payload));
  const checks = new Map<string, Promise<User>>();
  await Promise.all(Array.from(io.sockets.sockets.values()).map(async socket => {
    if (rooms.length && !rooms.some(room => socket.rooms.has(room))) return;
    const token = socket.data.token;
    // the permissions are read from the database, but not once per event per person: a few seconds are enough (a revoked session
    // is also cut by disconnectUser)
    if (!checks.has(token)) checks.set(token, remember(`su:${token.slice(-24)}`, 10000, () => sessionUser(token)));
    try {
      // "this conversation left that list" carries only an id: everyone who holds the list is told, even someone who may no longer
      // open the conversation (the new attendant's colleagues): otherwise it would stay in their Aguardando until they reloaded
      if (event === "ticket" && data.action === "delete" && data.ticketId && !data.ticket) {
        socket.data.visibleTickets?.delete(String(data.ticketId));
        socket.emit(event, data);
        return;
      }
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
