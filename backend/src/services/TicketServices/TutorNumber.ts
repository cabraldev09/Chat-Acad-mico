import { Op } from "sequelize";

import { getSetting } from "../../helpers/AppSettings";
import { getIO } from "../../libs/socket";
import Ticket from "../../models/Ticket";
import TicketEvent from "../../models/TicketEvent";
import User from "../../models/User";
import Whatsapp from "../../models/Whatsapp";
import { logger } from "../../utils/logger";
import ShowTicketService from "./ShowTicketService";

// The official number (WhatsApp Cloud API) is the door of the polos: the AI and the consultants answer there, inside the system. The tutors do not use
// it: a student sent to the tutoring continues on the tutor's own WhatsApp (their connection by QR Code, or the tutoring number set by the administration),
// the same conversation (its history goes along).

// both are WhatsApp: a conversation can move from the official number to a number by QR Code (the contact is the same phone)
export const sameWhatsapp = (a?: string | null, b?: string | null): boolean => {
  const x = a || "whatsapp";
  const y = b || "whatsapp";
  return x === y || ([x, y].every(c => c === "whatsapp" || c === "whatsapp_cloud"));
};

// the number the tutor answers from: their own connection (a connected one first), else the tutoring number of the administration
export const tutorConnectionFor = async (userId: number): Promise<Whatsapp | null> => {
  const own = await Whatsapp.findAll({ where: { ownerId: userId, channel: "whatsapp" } as any, order: [["id", "ASC"]] });
  const connected = own.find(w => w.status === "CONNECTED");
  if (connected || own[0]) return connected || own[0];
  const shared = Number(await getSetting("tutoria_whatsapp_id", "0")) || 0;
  return shared ? Whatsapp.findByPk(shared) : null;
};

// the conversation is on the official number and goes to the tutoring: where it continues (null = it stays where it is)
export const tutorMoveFor = async (ticket: Pick<Ticket, "whatsappId">, tutorId: number | null | undefined): Promise<{ whatsappId: number; whatsappName: string } | null> => {
  if (!tutorId || !ticket.whatsappId) return null;
  const from = await Whatsapp.findByPk(ticket.whatsappId, { attributes: ["id", "channel"] });
  if (!from || from.channel !== "whatsapp_cloud") return null;
  const to = await tutorConnectionFor(tutorId);
  if (!to || to.id === from.id) return null;
  return { whatsappId: to.id, whatsappName: to.name };
};

// Moves the conversation to the tutor's number, assigned to the tutor. When the student already has an open conversation there, that one is used
// (assigned to the tutor) and the conversation of the official number is closed, each with a note saying where the other one is.
export const moveToTutorNumber = async (ticketId: number, whatsappId: number, tutorId: number, actorId: number | null, queueId?: number | null): Promise<Ticket | null> => {
  const ticket = await Ticket.findByPk(ticketId);
  if (!ticket) return null;
  const tutor = await User.findByPk(tutorId, { attributes: ["id", "name"] });
  const to = await Whatsapp.findByPk(whatsappId, { attributes: ["id", "name"] });
  if (!tutor || !to) return null;
  const io = getIO();
  const emit = async (id: number, action = "update") => {
    try {
      const t = await ShowTicketService(String(id));
      io.to(t.status).to(String(t.id)).to("notification").emit("ticket", { action, ticket: t });
    } catch (err) {
      logger.warn(`Ticket ${id} update not sent: ${err}`);
    }
  };
  const fromStatus = ticket.status;
  const other = await Ticket.findOne({ where: { contactId: ticket.contactId, whatsappId, status: { [Op.in]: ["open", "pending"] }, id: { [Op.ne]: ticket.id } } as any });
  const note = `Conversa do número oficial passou para a tutoria no WhatsApp de ${tutor.name} (conexão ${to.name}).`;
  if (other) {
    await other.update({ userId: tutor.id, status: "open", ...(queueId ? { queueId } : {}), aiActive: false, chatbotNodeId: -1 });
    await TicketEvent.create({ ticketId: other.id, type: "transfer", actorId, toUserId: tutor.id, toQueueId: queueId || other.queueId || null, note: `${note} A conversa anterior (nº ${ticket.id}) está no histórico do contato.` } as any);
    await ticket.update({ status: "closed", closedAt: new Date(), aiActive: false, chatbotNodeId: -1 });
    await TicketEvent.create({ ticketId: ticket.id, type: "transfer", actorId, toUserId: tutor.id, note: `${note} Continua na conversa nº ${other.id}.` } as any);
    io.to(fromStatus).emit("ticket", { action: "delete", ticketId: ticket.id });
    await emit(other.id);
    return other;
  }
  await ticket.update({ whatsappId, userId: tutor.id, status: "open", ...(queueId ? { queueId } : {}), aiActive: false, chatbotNodeId: -1 });
  await TicketEvent.create({ ticketId: ticket.id, type: "transfer", actorId, toUserId: tutor.id, toQueueId: queueId || ticket.queueId || null, note } as any);
  if (fromStatus !== "open") io.to(fromStatus).emit("ticket", { action: "delete", ticketId: ticket.id });
  await emit(ticket.id);
  return ticket;
};
