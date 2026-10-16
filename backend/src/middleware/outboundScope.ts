import { Request } from "express";
import AppError from "../errors/AppError";
import Whatsapp from "../models/Whatsapp";
import Ticket from "../models/Ticket";
import Contact from "../models/Contact";
import Lead from "../models/Lead";
import { assertLead } from "./scope";
import { assertTicketAccess } from "./canAccessTicket";
import { isManagerRole } from "../helpers/Roles";

export const assertConnectionUse = async (req: Request, id: number): Promise<void> => {
  const connection = await Whatsapp.findByPk(id);
  if (!connection) throw new AppError("ERR_NO_WAPP_FOUND", 404);
  // the coordination has the same powers as the administration
  const manager = req.user.profile === "admin" || isManagerRole(req.user.role);
  if (!manager && connection.ownerId && connection.ownerId !== Number(req.user.id)) {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }
};

export const assertContactAccess = async (req: Request, contactId: number): Promise<void> => {
  if (isManagerRole(req.user.role)) return;
  const lead = await Lead.findOne({ where: { contactId }, attributes: ["id"] });
  if (lead) {
    try { await assertLead(req, lead.id); return; } catch (_) { /* a ticket may independently grant access */ }
  }
  const tickets = await Ticket.findAll({ where: { contactId }, attributes: ["id"] });
  if (!lead && !tickets.length) return; // an address-book entry without a conversation
  for (const ticket of tickets) {
    try { await assertTicketAccess(req, ticket.id, "read"); return; } catch (_) { /* try another segment */ }
  }
  throw new AppError("ERR_NO_PERMISSION", 403);
};

export const assertOutboundTarget = async (req: Request, target: any): Promise<void> => {
  const contact = await Contact.findByPk(target.contactId);
  if (!contact) throw new AppError("ERR_NO_CONTACT_FOUND", 404);
  await assertContactAccess(req, contact.id);
  if (target.whatsappId) await assertConnectionUse(req, Number(target.whatsappId));
  if (target.ticketId) {
    await assertTicketAccess(req, target.ticketId, "send");
    const ticket = await Ticket.findByPk(target.ticketId);
    if (ticket?.contactId !== contact.id || (target.whatsappId && Number(target.whatsappId) !== ticket.whatsappId)) {
      throw new AppError("ERR_NO_PERMISSION", 403);
    }
  }
};
