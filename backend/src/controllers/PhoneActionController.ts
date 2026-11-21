import { Request, Response } from "express";
import { parsePhoneNumberFromString } from "libphonenumber-js/min";
import AppError from "../errors/AppError";
import { whatsappProvider } from "../providers/WhatsApp";
import { assertConnectionUse, assertContactAccess } from "../middleware/outboundScope";
import { assertTicketAccess } from "../middleware/canAccessTicket";
import GetContactService from "../services/ContactServices/GetContactService";
import ShowTicketService from "../services/TicketServices/ShowTicketService";
import FindOrCreateTicketService from "../services/TicketServices/FindOrCreateTicketService";
import UpdateTicketService from "../services/TicketServices/UpdateTicketService";

const lookup = async (req: Request) => {
  const phone = parsePhoneNumberFromString(String(req.query.number || req.body.number || ""), "BR");
  if (!phone?.isValid()) throw new AppError("ERR_WAPP_INVALID_CONTACT", 400);
  const source = await ShowTicketService(req.params.ticketId);
  await assertConnectionUse(req, source.whatsappId);
  const channel = source.whatsapp?.channel || "whatsapp";
  // the official API cannot look a number up before writing to it: "unknown" (null), and the conversation can still be opened
  if (channel === "whatsapp_cloud") return { phone, source, registered: null as boolean | null, number: phone.number.slice(1) };
  if (channel !== "whatsapp") return { phone, source, registered: false as boolean | null, number: phone.number.slice(1) };
  const found = await whatsappProvider.checkNumber(source.whatsappId, phone.number.slice(1));
  return { phone, source, registered: !!found as boolean | null, number: String(found || phone.number).split("@")[0].replace(/\D/g, "") };
};
export const show = async (req: Request, res: Response) => {
  const { phone, registered } = await lookup(req);
  return res.json({ number: phone.number, formatted: phone.formatNational(), registered });
};
export const open = async (req: Request, res: Response) => {
  const { phone, source, registered, number } = await lookup(req);
  if (registered === false) throw new AppError("ERR_WAPP_INVALID_CONTACT", 400);
  const contact = await GetContactService({ name: phone.formatNational(), number });
  await assertContactAccess(req, contact.id);
  const ticket = await FindOrCreateTicketService(contact, source.whatsappId, 0);
  await assertTicketAccess(req, ticket.id, "send");
  if (!ticket.userId || ticket.status !== "open") {
    await UpdateTicketService({ ticketId: ticket.id, ticketData: { status: "open", userId: Number(req.user.id) } });
  }
  return res.json(await ShowTicketService(ticket.id));
};
