import AppError from "../../errors/AppError";
import { getSetting } from "../../helpers/AppSettings";
import Message from "../../models/Message";
import Ticket from "../../models/Ticket";
import User from "../../models/User";
import Whatsapp from "../../models/Whatsapp";
import { sideOfSegment } from "../ChannelServices/ConnectionTeam";
import { inMessagingWindow, validateTemplate } from "../OutboundServices/Policy";
import ShowTicketService from "./ShowTicketService";

// The message that opens a conversation on an official number outside the 24 hours (the tutor greeting a new student, the consultant
// calling a client back): a template approved by the Meta, one per side, set in Configurações. {{1}} = first name of the student,
// {{2}} = first name of whoever writes.
export const openingTemplateOf = async (side: "tutoria" | "atendimento"): Promise<{ name: string; language: string } | null> => {
  const name = String(await getSetting(`${side}_template_name`, "")).trim();
  const language = String(await getSetting(`${side}_template_language`, "pt_BR")).trim() || "pt_BR";
  return name ? { name, language } : null;
};

const first = (name?: string | null): string => String(name || "").trim().split(/\s+/)[0] || "";

export interface WindowState {
  official: boolean;
  open: boolean;
  template: { name: string; language: string } | null;
}

// whether the 24 hours of this conversation's number are open, and the opening template of its side
export const windowOf = async (ticket: Pick<Ticket, "id" | "whatsappId" | "segment" | "contactId">): Promise<WindowState> => {
  const w = await Whatsapp.findByPk(ticket.whatsappId, { attributes: ["id", "channel"] });
  const channel = w?.channel || "whatsapp";
  if (channel !== "whatsapp_cloud") return { official: false, open: true, template: null };
  const last = await Message.findOne({ where: { fromMe: false }, include: [{ model: Ticket, as: "ticket", attributes: [], where: { contactId: ticket.contactId, whatsappId: ticket.whatsappId }, required: true }], order: [["createdAt", "DESC"]], attributes: ["createdAt"] });
  const side = sideOfSegment(ticket.segment) === "tutoria" ? "tutoria" : "atendimento";
  return { official: true, open: inMessagingWindow(channel, last ? new Date(last.createdAt) : null), template: await openingTemplateOf(side) };
};

export const sendOpeningTemplate = async (ticketId: number, userId: number): Promise<void> => {
  const ticket = await ShowTicketService(String(ticketId));
  const state = await windowOf(ticket);
  if (!state.official) throw new AppError("ERR_OPENING_TEMPLATE_NOT_OFFICIAL", 400);
  if (state.open) throw new AppError("ERR_OPENING_TEMPLATE_WINDOW_OPEN", 400);
  if (!state.template) throw new AppError("ERR_OPENING_TEMPLATE_MISSING", 400);
  const user = await User.findByPk(userId, { attributes: ["id", "name"] });
  const template = { ...state.template, params: [first(ticket.contact?.name) || "tudo bem", first(user?.name) || "nossa equipe"] };
  if (!validateTemplate(template)) throw new AppError("ERR_OPENING_TEMPLATE_INVALID", 400);
  const whatsapp = await Whatsapp.findByPk(ticket.whatsappId);
  if (!whatsapp) throw new AppError("ERR_NO_WAPP_FOUND", 404);
  // loaded here: SendToContact imports the ticket services
  const { default: SendToContact } = await import("../ChannelServices/SendToContact");
  await SendToContact({ contact: ticket.contact, whatsapp, body: `[Mensagem de abertura: ${template.name}]`, template, keepOpen: { userId }, idempotencyKey: `opening/${ticket.id}/${new Date().toISOString().slice(0, 13)}` });
};
