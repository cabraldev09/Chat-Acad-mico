import { Request, Response, NextFunction } from "express";

import AppError from "../errors/AppError";
import Ticket from "../models/Ticket";
import UserQueue from "../models/UserQueue";
import Message from "../models/Message";
import { SEGMENTS_OF, isManagerRole, roleOf } from "../helpers/Roles";
import { ticketInPolos, ticketPolosOf } from "../helpers/TicketPoloScope";
import { connectionScopeOf, ticketVisibleIn } from "../helpers/ConnectionScope";
import Lead from "../models/Lead";
import Contact from "../models/Contact";
import { isPlainPerson, isQueueLead, isQueueMode } from "../helpers/LeadQueue";

const queueIdsOf = async (userId: number): Promise<number[]> => {
  const rows = await UserQueue.findAll({ where: { userId } });
  return rows.map(r => r.queueId);
};

// "read": the conversation belongs to the user's sectors (or has none) and the segment is one the role works on;
//         the coordination reads the conversations of its polos (helpers/TicketPoloScope)
// "write": additionally, it must be the user's own or still unassigned
// A consultant never sees the tutor's messages and vice versa: tutoring lives in
// its own conversation (segment "onboarding") in the tutoring queue of the polo.
export const assertTicketAccess = async (
  req: Request,
  ticketId: string | number,
  mode: "read" | "write" | "send" | "claim"
): Promise<void> => {
    const role = roleOf(req.user);
    if (isManagerRole(role)) {
      // the coordination reads and changes only the conversations of its polos (or given to it); the ones of another polo and the ones
      // with no polo are the administration's (helpers/TicketPoloScope)
      if (role === "coordenacao") {
        const t = await Ticket.findByPk(ticketId, { attributes: ["id", "userId"] });
        if (!t) throw new AppError("ERR_NO_TICKET_FOUND", 404);
        if (t.userId !== Number(req.user.id) && !(await ticketInPolos(t.id, (await ticketPolosOf(role, Number(req.user.id))) || [], false))) {
          throw new AppError("ERR_NO_PERMISSION", 403);
        }
      }
      // administration and coordination read everything they see; in a student's tutoring conversation they write only when it is
      // assigned to them (the tutor is the one who talks to the student: nobody answers "as the tutor" by accident)
      // ("send" = a message goes out; changing the conversation, e.g. transferring it, stays allowed)
      if (mode !== "send") return;
      const t = await Ticket.findByPk(ticketId, { attributes: ["id", "userId", "segment", "isGroup"] });
      if (t && t.segment === "onboarding" && t.userId !== Number(req.user.id)) throw new AppError("ERR_ONBOARDING_TUTOR_ONLY", 403);
      // seeing everything is not owning everything: a conversation that belongs to another attendant is not answered "over" them.
      // The management transfers it or takes it over explicitly (POST /tickets/:id/take); groups have no single attendant.
      if (t && !t.isGroup && t.userId && t.userId !== Number(req.user.id)) throw new AppError("ERR_TICKET_OWNED_BY_OTHER", 403);
      return;
    }

    const ticket = await Ticket.findByPk(ticketId, {
      attributes: ["id", "userId", "queueId", "segment", "isGroup", "whatsappId", "contactId"]
    });
    if (!ticket) throw new AppError("ERR_NO_TICKET_FOUND", 404);

    const me = Number(req.user.id);
    // THE COMMON QUEUE (helpers/LeadQueue): the private sales conversation nobody attends yet, of a person who has no lead or a lead of the
    // queue, is readable by every consultant (also on another person's QR number) and can be claimed by them; to answer it they have to
    // "Assumir" first (the send is refused with ERR_LEAD_CLAIM_FIRST until the lead is theirs)
    let queueTicket = false;
    let queueLead = false;
    if (role === "consultor" && !ticket.userId && !ticket.isGroup && (!ticket.segment || ticket.segment === "sales") && (await isQueueMode())) {
      const lead = await Lead.findOne({ where: { contactId: ticket.contactId }, attributes: ["id", "ownerId", "enrolledAt", "wonAt", "lostAt", "isHistorical", "onboardingStatus"] });
      queueLead = !!lead && isQueueLead(lead);
      queueTicket = queueLead || (!lead && isPlainPerson(await Contact.findByPk(ticket.contactId, { attributes: ["id", "isStaff", "isPersonal", "kind"] })));
    }
    if (queueTicket && (mode === "read" || mode === "claim")) return;
    if (queueTicket && queueLead && mode === "send") throw new AppError("ERR_LEAD_CLAIM_FIRST", 409);
    // another number's groups and personal chats are not readable, even knowing the id
    if (!ticketVisibleIn(await connectionScopeOf(me, role), ticket, me)) throw new AppError("ERR_NO_PERMISSION", 403);
    const mine = ticket.userId === me;
    const mySide = (SEGMENTS_OF[role] || []).includes(ticket.segment || "sales");
    if (!mine && !mySide) {
      throw new AppError("ERR_NO_PERMISSION", 403);
    }
    // each profile answers on its own side's number (the consultant on Atendimento, the tutor on Tutoria): a conversation of the other side
    // is never answered, even one given to the person by mistake. The way across is "Chamar a tutoria" / "Chamar o consultor".
    if ((mode === "write" || mode === "send" || mode === "claim") && !mySide && !ticket.isGroup) throw new AppError("ERR_WRONG_SIDE", 403);

    // the relationship team: beyond the conversations given to it, only the students of its polos
    if (role === "relacionamento" && !mine && !(await ticketInPolos(ticket.id, (await ticketPolosOf(role, me)) || [], true))) {
      throw new AppError("ERR_NO_PERMISSION", 403);
    }

    const queues = await queueIdsOf(me);
    const inMyQueues = !ticket.queueId || queues.includes(ticket.queueId);

    // Agents read their own conversations and the ones still waiting in their queues, never a
    // colleague's (the consultant and the tutor must not see each other's messages).
    if (mode === "read" && (mine || (inMyQueues && !ticket.userId))) return;
    if ((mode === "write" || mode === "send" || mode === "claim") && (mine || (!ticket.userId && inMyQueues))) return;

    throw new AppError("ERR_NO_PERMISSION", 403);
};

const buildGuard =
  (mode: "read" | "write" | "send" | "claim", param = "ticketId") =>
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
export const canSendTicket = buildGuard("send");
// "Assumir" the conversation: like writing, and also open to the queue's conversations (the claim takes the lead with it)
export const canClaimTicket = buildGuard("claim");
