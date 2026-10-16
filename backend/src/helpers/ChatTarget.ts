import { Request } from "express";
import { Op } from "sequelize";

import AppError from "../errors/AppError";
import Contact from "../models/Contact";
import Ticket from "../models/Ticket";
import CreateTicketService from "../services/TicketServices/CreateTicketService";

// "Send this to a contact": the person picked a contact (or a conversation). A contact's open conversation is used, or
// one is opened for them; the answer is the conversation to write in. Shared by every screen that sends something
// ready-made (grades, the commercial proposal).
export const ticketFromTarget = async (req: Request, body: { ticketId?: unknown; contactId?: unknown }): Promise<number> => {
  let ticketId = Number(body?.ticketId);
  const contactId = Number(body?.contactId);
  if (!ticketId && contactId) {
    const contact = await Contact.findByPk(contactId, { attributes: ["id", "isGroup"] });
    if (!contact) throw new AppError("Contato não encontrado.", 404);
    if (contact.isGroup) throw new AppError("Escolha um contato, não um grupo.", 400);
    const open = await Ticket.findOne({ where: { contactId, status: { [Op.in]: ["open", "pending"] } } as any, order: [["updatedAt", "DESC"]], attributes: ["id"] });
    ticketId = open ? open.id : (await CreateTicketService({ contactId, status: "open", userId: Number(req.user.id) })).id;
  }
  if (!ticketId) throw new AppError("Escolha o contato.", 400);
  return ticketId;
};
