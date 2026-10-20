import { NextFunction, Request, Response } from "express";

import AppError from "../errors/AppError";
import Lead from "../models/Lead";
import Ticket from "../models/Ticket";
import { assertTicketAccess } from "./canAccessTicket";
import { isAdminReq, withLeadScope } from "./scope";

// Who may read or change a contact: administration and coordination always; everybody else only when the person is one of their leads
// (see leadScopeWhere) or when they can read one of the conversations of that contact. Same rule the live updates of a contact follow.
export const hasContactAccess = async (req: Request, contactId: number): Promise<boolean> => {
  if (isAdminReq(req)) return true;
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
  next();
};
