import CheckContactOpenTickets from "../../helpers/CheckContactOpenTickets";
import SetTicketMessagesAsRead from "../../helpers/SetTicketMessagesAsRead";
import { getIO } from "../../libs/socket";
import Ticket from "../../models/Ticket";
import Queue from "../../models/Queue";
import User from "../../models/User";
import TicketEvent from "../../models/TicketEvent";
import AppError from "../../errors/AppError";
import { logger } from "../../utils/logger";
import dispatchWebhook from "../WebhookServices/DispatchWebhook";
import SendWhatsAppMessage from "../WbotServices/SendWhatsAppMessage";
import ShowWhatsAppService from "../WhatsappService/ShowWhatsAppService";
import ShowTicketService from "./ShowTicketService";
import { fire } from "../../helpers/Fire";

interface TicketData {
  status?: string;
  userId?: number | null;
  queueId?: number | null;
  whatsappId?: number;
}

interface Request {
  ticketData: TicketData;
  ticketId: string | number;
  // set when a person (not an automation) is changing the ticket
  actorId?: number;
  note?: string;
  notifyClient?: boolean;
}

const VALID_STATUS = ["open", "pending", "closed"];
// ChatbotNode state meaning "flow already finished for this ticket"
const FLOW_DONE = -1;

interface Response {
  ticket: Ticket;
  oldStatus: string;
  oldUserId: number | undefined;
}

const UpdateTicketService = async ({
  ticketData,
  ticketId,
  actorId,
  note,
  notifyClient
}: Request): Promise<Response> => {
  const { whatsappId } = ticketData;
  let { status, userId, queueId } = ticketData;
  const manual = actorId !== undefined;

  const ticket = await ShowTicketService(ticketId);
  await SetTicketMessagesAsRead(ticket);

  if (status !== undefined && !VALID_STATUS.includes(status)) {
    throw new AppError("ERR_INVALID_TICKET_STATUS", 400);
  }

  const previousQueueId = ticket.queueId;
  const previousUserId = ticket.userId;

  const targetQueue = queueId ? await Queue.findByPk(queueId) : null;
  if (queueId && !targetQueue) throw new AppError("ERR_NO_QUEUE_FOUND", 404);

  const targetUser = userId
    ? await User.findByPk(userId, { include: ["queues"] })
    : null;
  if (userId && !targetUser) throw new AppError("ERR_NO_USER_FOUND", 404);

  const queueChanged = queueId !== undefined && queueId !== previousQueueId;
  const userChanged = userId !== undefined && userId !== previousUserId;

  // Manual transfers keep the ticket consistent: the agent must belong to the
  // destination sector, and sending to a sector alone releases the ticket.
  if (manual && status !== "closed") {
    if (targetUser && targetUser.profile !== "admin") {
      const destination = queueId || ticket.queueId;
      if (
        destination &&
        !(targetUser.queues || []).some(q => q.id === destination)
      ) {
        throw new AppError("ERR_USER_NOT_IN_QUEUE", 422);
      }
    }
    if (queueChanged && userId === undefined) userId = null;
    if (status === undefined && (queueChanged || userChanged)) {
      status = userId ? "open" : "pending";
    }
  }

  const isTransfer = manual && status !== "closed" && (queueChanged || userChanged);

  if (whatsappId && ticket.whatsappId !== whatsappId) {
    const target = await ShowWhatsAppService(whatsappId);
    if ((target.channel || "whatsapp") !== (ticket.whatsapp?.channel || "whatsapp")) {
      throw new AppError("ERR_CHANNEL_MISMATCH", 422);
    }
    await CheckContactOpenTickets(ticket.contactId, whatsappId);
  }

  const oldStatus = ticket.status;
  const oldUserId = ticket.user?.id;

  if (oldStatus === "closed") {
    await CheckContactOpenTickets(ticket.contact.id, ticket.whatsappId);
  }

  await ticket.update({
    status,
    queueId,
    userId
  });

  // the triggers hear about what changed (never waits, never fails this update)
  if (status && status !== oldStatus) fire(status === "closed" ? "ticket.closed" : status === "open" ? "ticket.opened" : "ticket.pending", { ticketId: ticket.id, contactId: ticket.contactId });
  if (userChanged && userId) fire("ticket.assigned", { ticketId: ticket.id, contactId: ticket.contactId, userId });

  if (status === "closed" && oldStatus !== "closed") {
    await ticket.update({ closedAt: new Date() });
  } else if (status && status !== "closed" && oldStatus === "closed") {
    await ticket.update({ closedAt: null, chatbotNodeId: null, aiActive: true });
  }

  // reopening a conversation from the copied history makes it a real one, counted from this moment
  if (status && status !== "closed" && ticket.isHistorical) {
    await ticket.update({ isHistorical: false, firstResponseAt: null });
    await Ticket.update({ createdAt: new Date() } as any, { where: { id: ticket.id }, silent: true } as any);
  }

  if (whatsappId) {
    await ticket.update({
      whatsappId
    });
  }

  if (isTransfer) {
    // the conversation now belongs to a person/sector: bots must stay quiet
    await ticket.update({ aiActive: false, chatbotNodeId: FLOW_DONE });
    await TicketEvent.create({
      ticketId: ticket.id,
      type: "transfer",
      actorId,
      fromQueueId: previousQueueId || null,
      toQueueId: queueId !== undefined ? queueId : previousQueueId || null,
      fromUserId: previousUserId || null,
      toUserId: userId !== undefined ? userId : previousUserId || null,
      note: note ? String(note).slice(0, 1000) : null
    });
  }

  await ticket.reload();

  const io = getIO();

  if (ticket.status !== oldStatus || ticket.user?.id !== oldUserId) {
    io.to(oldStatus).emit("ticket", {
      action: "delete",
      ticketId: ticket.id
    });
  }

  io.to(ticket.status)
    .to("notification")
    .to(ticketId.toString())
    .emit("ticket", {
      action: "update",
      ticket
    });

  await dispatchWebhook(
    ticket.status === "closed" && oldStatus !== "closed"
      ? "ticket.closed"
      : "ticket.updated",
    {
      ticketId: ticket.id,
      status: ticket.status,
      oldStatus,
      userId: ticket.userId,
      queueId: ticket.queueId,
      contactId: ticket.contactId
    }
  );

  if (isTransfer) {
    if (notifyClient) {
      const where = targetUser
        ? `o atendente *${targetUser.name}*`
        : targetQueue
        ? `o setor *${targetQueue.name}*`
        : null;
      if (where) {
        try {
          await SendWhatsAppMessage({
            body: `Seu atendimento foi encaminhado para ${where}. Em instantes você será atendido.`,
            ticket
          });
        } catch (err) {
          logger.warn(`Transfer notice not delivered: ${err}`);
        }
      }
    }

    // a sector with auto-assignment picks the next agent right away
    if (ticket.queueId && !ticket.userId) {
      const { default: AutoAssignTicket } = await import(
        "../AutomationServices/AutoAssignTicket"
      );
      await AutoAssignTicket(await ShowTicketService(ticket.id));
      await ticket.reload();
    }
  }

  return { ticket, oldStatus, oldUserId };
};

export default UpdateTicketService;
