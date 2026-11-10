import { Request } from "express";
import { Op } from "sequelize";

import AppError from "../errors/AppError";
import Contact from "../models/Contact";
import Ticket from "../models/Ticket";
import User from "../models/User";
import Whatsapp from "../models/Whatsapp";
import ActivateForSending from "../services/TicketServices/ActivateForSending";
import CreateTicketService from "../services/TicketServices/CreateTicketService";
import GetDefaultWhatsApp from "./GetDefaultWhatsApp";

// "Send this to a contact": the person picked a contact (or a conversation) and the answer is the conversation to write in. Shared by
// every screen that sends something ready-made (grades, the commercial proposal).
//
// A PERSON: the open conversation that is mine (or nobody's) is used. A conversation that belongs to somebody else (the tutor's, another
// attendant's) is never written "over": a conversation is opened in the connection chosen (or in my default one). Only when the other
// person's conversation lives in that very connection the send is refused, with who is attending and the connections that can be used.
//
// A GROUP (only for the screens that allow it): a group lives in the numbers that take part in it, so the message goes out through the QR
// connection where the group is. The official API (WhatsApp Cloud) does not write to groups. A group that lives in more than one
// connection asks which one.
export interface TargetBody { ticketId?: unknown; contactId?: unknown; whatsappId?: unknown }
export interface TargetOptions { allowGroups?: boolean }

export const CHOOSE_CONNECTION = "ERR_CHOOSE_CONNECTION";

const connectionView = (w: Whatsapp) => ({ id: w.id, name: w.name, channel: w.channel, status: w.status });

// the connections a person may start a conversation from: the institution's and their own (never a colleague's personal number)
const sendableConnections = async (me: number): Promise<Whatsapp[]> => {
  const rows = await Whatsapp.findAll({ attributes: ["id", "name", "channel", "status", "ownerId"], order: [["name", "ASC"]] });
  return rows.filter(w => !w.ownerId || w.ownerId === me);
};

const groupTicket = async (contact: Contact, wanted: number | null, me: number): Promise<number> => {
  const tickets = await Ticket.findAll({ where: { contactId: contact.id, isGroup: true } as any, order: [["updatedAt", "DESC"]] });
  const ids = [...new Set(tickets.map(t => t.whatsappId).filter(Boolean))] as number[];
  const connections = ids.length ? await Whatsapp.findAll({ where: { id: { [Op.in]: ids } } as any, attributes: ["id", "name", "channel", "status", "ownerId"] }) : [];
  const qr = connections.filter(w => (w.channel || "whatsapp") === "whatsapp");
  if (!qr.length) {
    throw new AppError(
      connections.length
        ? "Grupos só recebem envio por uma conexão de WhatsApp por QR Code que participe deles. A API oficial não envia para grupos."
        : "Este grupo ainda não tem conversa em nenhuma conexão de QR Code. Abra o grupo em Conversas e tente de novo.",
      400
    );
  }
  let chosen: Whatsapp | undefined;
  if (wanted) {
    chosen = qr.find(w => w.id === wanted);
    if (!chosen) throw new AppError("Este grupo não está na conexão escolhida.", 400);
  } else if (qr.length === 1) [chosen] = qr;
  else {
    // more than one number is in the group: the one that is connected, when it is the only one; else the screen asks
    const connected = qr.filter(w => w.status === "CONNECTED");
    if (connected.length === 1) [chosen] = connected;
    else throw new AppError(CHOOSE_CONNECTION, 409, { message: `O grupo ${contact.name} está em mais de uma conexão. Escolha por qual número enviar.`, connections: qr.map(connectionView) });
  }
  const ticket = tickets.find(t => t.whatsappId === chosen!.id) as Ticket;
  // a group is opened by the first message the team sends (no "Reabrir" in the way)
  await ActivateForSending(ticket, me);
  return ticket.id;
};

const personTicket = async (contact: Contact, wanted: number | null, me: number): Promise<number> => {
  const open = await Ticket.findAll({
    where: { contactId: contact.id, isGroup: false, status: { [Op.in]: ["open", "pending"] } } as any,
    order: [["updatedAt", "DESC"]],
    attributes: ["id", "userId", "segment", "whatsappId", "status"]
  });
  const usable = (t: Ticket) => !t.userId || t.userId === me;
  const pool = wanted ? open.filter(t => t.whatsappId === wanted) : open;
  // mine first, then the one nobody took
  const own = pool.find(t => t.userId === me) || pool.find(t => usable(t) && t.segment !== "onboarding");
  if (own) return own.id;

  const target = wanted ? await Whatsapp.findByPk(wanted) : await GetDefaultWhatsApp(me);
  if (!target) throw new AppError("Conexão não encontrada.", 404);
  const busy = open.find(t => t.whatsappId === target.id);
  if (busy) {
    // somebody else is talking to this person in this very number: nobody answers over them
    const owner = busy.userId ? await User.findByPk(busy.userId, { attributes: ["id", "name"] }) : null;
    const taken = new Set(open.map(t => t.whatsappId));
    const others = (await sendableConnections(me)).filter(w => !taken.has(w.id));
    const who = owner ? `${owner.name}${busy.segment === "onboarding" ? " (tutoria)" : ""}` : "outro atendente";
    throw new AppError(CHOOSE_CONNECTION, 409, {
      message: others.length
        ? `${contact.name} está em atendimento com ${who} nesta conexão. Escolha outra conexão para enviar.`
        : `${contact.name} está em atendimento com ${who}. Peça a transferência da conversa ou peça para ${owner ? owner.name.split(" ")[0] : "quem atende"} enviar.`,
      connections: others.map(connectionView)
    });
  }
  return (await CreateTicketService({ contactId: contact.id, status: "open", userId: me, whatsappId: target.id })).id;
};

export const ticketFromTarget = async (req: Request, body: TargetBody, options: TargetOptions = {}): Promise<number> => {
  let ticketId = Number(body?.ticketId);
  const contactId = Number(body?.contactId);
  if (!ticketId && contactId) {
    const contact = await Contact.findByPk(contactId, { attributes: ["id", "isGroup", "name"] });
    if (!contact) throw new AppError("Contato não encontrado.", 404);
    const me = Number(req.user.id);
    const wanted = Number(body?.whatsappId) || null;
    if (contact.isGroup) {
      if (!options.allowGroups) throw new AppError("Escolha um contato, não um grupo.", 400);
      ticketId = await groupTicket(contact, wanted, me);
    } else ticketId = await personTicket(contact, wanted, me);
  }
  if (!ticketId) throw new AppError("Escolha o contato.", 400);
  return ticketId;
};
