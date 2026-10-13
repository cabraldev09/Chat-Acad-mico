import { Request, Response, NextFunction } from "express";

import AppError from "../errors/AppError";
import Ticket from "../models/Ticket";
import UserQueue from "../models/UserQueue";

const queueIdsOf = async (userId: number): Promise<number[]> => {
  const rows = await UserQueue.findAll({ where: { userId } });
  return rows.map(r => r.queueId);
};

// "read": the ticket belongs to the user's sectors (or has none)
// "write": additionally, it must be the user's own or still unassigned
const buildGuard =
  (mode: "read" | "write", param = "ticketId") =>
  async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    if (req.user.profile === "admin") return next();

    const ticket = await Ticket.findByPk(req.params[param], {
      attributes: ["id", "userId", "queueId"]
    });
    if (!ticket) throw new AppError("ERR_NO_TICKET_FOUND", 404);

    const me = Number(req.user.id);
    const mine = ticket.userId === me;
    const queues = await queueIdsOf(me);
    const inMyQueues = !ticket.queueId || queues.includes(ticket.queueId);

    if (mode === "read" && (mine || inMyQueues)) return next();
    if (mode === "write" && (mine || (!ticket.userId && inMyQueues))) {
      return next();
    }

    throw new AppError("ERR_NO_PERMISSION", 403);
  };

export const canReadTicket = buildGuard("read");
export const canWriteTicket = buildGuard("write");
