import { Request, Response, NextFunction } from "express";

import AppError from "../errors/AppError";
import Queue from "../models/Queue";
import Ticket from "../models/Ticket";
import UserQueue from "../models/UserQueue";
import Message from "../models/Message";
import { SEGMENTS_OF, roleOf } from "../helpers/Roles";
import { poloIdsOf } from "./scope";

const queueIdsOf = async (userId: number): Promise<number[]> => {
  const rows = await UserQueue.findAll({ where: { userId } });
  return rows.map(r => r.queueId);
};

// "read": the conversation belongs to the user's sectors (or has none), the
//         segment is one the role works on, and coordinators read their whole polo
// "write": additionally, it must be the user's own or still unassigned
// A consultant never sees the tutor's messages and vice versa: tutoring lives in
// its own conversation (segment "onboarding") in the tutoring queue of the polo.
export const assertTicketAccess = async (
  req: Request,
  ticketId: string | number,
  mode: "read" | "write"
): Promise<void> => {
    const role = roleOf(req.user);
    if (role === "admin") return;

    const ticket = await Ticket.findByPk(ticketId, {
      attributes: ["id", "userId", "queueId", "segment"]
    });
    if (!ticket) throw new AppError("ERR_NO_TICKET_FOUND", 404);

    const me = Number(req.user.id);
    const mine = ticket.userId === me;
    if (!mine && !(SEGMENTS_OF[role] || []).includes(ticket.segment || "sales")) {
      throw new AppError("ERR_NO_PERMISSION", 403);
    }

    const queues = await queueIdsOf(me);
    const inMyQueues = !ticket.queueId || queues.includes(ticket.queueId);

    let poloRead = false;
    if (mode === "read" && role === "coordenacao" && ticket.queueId && !inMyQueues) {
      const queue = await Queue.findByPk(ticket.queueId, { attributes: ["poloId"] });
      poloRead = !!queue?.poloId && (await poloIdsOf(me)).includes(queue.poloId);
    }

    // Agents read their own conversations and the ones still waiting in their queues, never a
    // colleague's (the consultant and the tutor must not see each other's messages).
    // Coordination reads its queues and its whole polo.
    const sharedRead = !ticket.userId || role === "coordenacao";
    if (mode === "read" && (mine || (inMyQueues && sharedRead) || poloRead)) return;
    if (mode === "write" && (mine || (!ticket.userId && inMyQueues))) return;

    throw new AppError("ERR_NO_PERMISSION", 403);
};

const buildGuard =
  (mode: "read" | "write", param = "ticketId") =>
  async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    await assertTicketAccess(req, req.params[param], mode);
    next();
  };

// guards routes addressed by message id (/messages/:messageId/...)
export const canWriteMessage = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
  const message = await Message.findByPk(req.params.messageId, { attributes: ["id", "ticketId"] });
  if (!message) throw new AppError("ERR_NO_MESSAGE_FOUND", 404);
  await assertTicketAccess(req, message.ticketId, "write");
  next();
};

export const canReadTicket = buildGuard("read");
export const canWriteTicket = buildGuard("write");
