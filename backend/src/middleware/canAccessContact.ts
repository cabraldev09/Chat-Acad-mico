import { NextFunction, Request, Response } from "express";

import AppError from "../errors/AppError";
import Lead from "../models/Lead";
import Ticket from "../models/Ticket";
import { assertTicketAccess } from "./canAccessTicket";
import { seesEveryPolo, withLeadScope } from "./scope";
import { roleOf } from "../helpers/Roles";
import { queueContactIds } from "../helpers/LeadQueue";

// Who may read or change a contact: the administration always; everybody else (the coordination included: its polos) only when the person
// is one of their leads (see leadScopeWhere) or when they can read one of the conversations of that contact. Same rule the live updates
// of a contact follow.
export const hasContactAccess = async (req: Request, contactId: number): Promise<boolean> => {
  if (seesEveryPolo(req)) return true;
  if (await Lead.findOne({ where: await withLeadScope(req, { contactId }), attributes: ["id"] })) return true;
  const tickets = await Ticket.findAll({ where: { contactId }, attributes: ["id"] });
  for (const ticket of tickets) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await assertTicketAccess(req, ticket.id, "read");
      return true;
    } catch (_) {
      /* another segment or another number */
    }
  }
  return false;
};

// A contact nobody works yet (no conversation and no lead): anyone who can create conversations may start the first one (a brand new contact)
export const contactIsFree = async (contactId: number): Promise<boolean> =>
  (await Ticket.count({ where: { contactId } })) === 0 && (await Lead.count({ where: { contactId } })) === 0;

export const hasContactAccessOrFree = async (req: Request, contactId: number): Promise<boolean> => (await hasContactAccess(req, contactId)) || (await contactIsFree(contactId));

export const canAccessContact = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
  const id = Number(req.params.contactId);
  if (!Number.isInteger(id) || id <= 0) throw new AppError("ERR_NO_CONTACT_FOUND", 404);
  if (!(await hasContactAccess(req, id))) throw new AppError("ERR_NO_PERMISSION", 403);
  // THE COMMON QUEUE: the person of a lead nobody assumed yet is only read, as name and number; to change it (name, e-mail, marks, tags) the consultant assumes first
  if (roleOf(req.user as any) === "consultor" && (await queueContactIds([id])).has(id)) {
    if (req.method !== "GET") throw new AppError("ERR_LEAD_CLAIM_FIRST", 403);
    (req as any).contactInQueue = true;
  }
  next();
};
