import { Request, Response, NextFunction } from "express";

import AppError from "../errors/AppError";
import Queue from "../models/Queue";
import Ticket from "../models/Ticket";
import UserQueue from "../models/UserQueue";
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
const buildGuard =
  (mode: "read" | "write", param = "ticketId") =>
  async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const role = roleOf(req.user);
    if (role === "admin") return next();

    const ticket = await Ticket.findByPk(req.params[param], {
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

    if (mode === "read" && (mine || inMyQueues || poloRead)) return next();
    if (mode === "write" && (mine || (!ticket.userId && inMyQueues))) return next();

    throw new AppError("ERR_NO_PERMISSION", 403);
  };

export const canReadTicket = buildGuard("read");
export const canWriteTicket = buildGuard("write");
