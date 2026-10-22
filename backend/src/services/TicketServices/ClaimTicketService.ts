import { Op, Transaction } from "sequelize";

import sequelize from "../../database";
import AppError from "../../errors/AppError";
import { afterCommit } from "../../helpers/TransactionContext";
import { fire } from "../../helpers/Fire";
import { logger } from "../../utils/logger";
import { getIO } from "../../libs/socket";
import ChatFlowRun from "../../models/ChatFlowRun";
import Ticket from "../../models/Ticket";
import TicketEvent from "../../models/TicketEvent";
import User from "../../models/User";
import ShowTicketService from "./ShowTicketService";
import dispatchWebhook from "../WebhookServices/DispatchWebhook";
import CheckContactOpenTickets from "../../helpers/CheckContactOpenTickets";

// ChatbotNode state meaning "flow already finished for this ticket"
const FLOW_DONE = -1;

export type ClaimReason = "send" | "accept" | "takeover";

interface Input {
  ticketId: number;
  userId: number;
  reason: ClaimReason;
  // a manager taking a conversation that belongs to someone else (never implied by sending or opening)
  force?: boolean;
  // groups, copied history and the team's own chats open by the first message; a closed attendance does not
  allowReopen?: boolean;
  // when the claim is part of a bigger unit of work (the send), it joins that transaction instead of opening its own
  transaction?: Transaction;
}

interface Result {
  ticket: Ticket;
  // false when the conversation was already the sender's (idempotent)
  changed: boolean;
  previousUserId: number | null;
}

// Stops everything the robot had scheduled for the conversation (timers live in this process, the runs in the database).
const silenceRobot = async (ticketId: number): Promise<void> => {
  const { cancelAiTimer } = await import("../AutomationServices/RunInboundAutomation");
  const { cancelDebounce } = await import("../FlowServices/Debounce");
  cancelAiTimer(ticketId);
  cancelDebounce(String(ticketId));
};

// Tells the lists, the open chat and the integrations, after the new state is committed.
const notify = async (ticketId: number, oldStatus: string, previousUserId: number | null, userId: number): Promise<void> => {
  const ticket = await ShowTicketService(ticketId);
  const io = getIO();
  if (ticket.status !== oldStatus || previousUserId !== userId) {
    io.to(oldStatus).emit("ticket", { action: "delete", ticketId });
  }
  io.to(ticket.status).to("notification").to(String(ticketId)).to(`user:${userId}`).emit("ticket", { action: "update", ticket });
  await dispatchWebhook("ticket.updated", {
    ticketId,
    status: ticket.status,
    oldStatus,
    userId: ticket.userId,
    queueId: ticket.queueId,
    contactId: ticket.contactId
  }).catch(() => undefined);
};

// The one place where a conversation gets its attendant. The row is locked, the owner is checked and written in the same
// transaction, so two people can never both win: the second one gets ERR_TICKET_ALREADY_ASSIGNED and nothing changes.
// Everything that depends on the new state (robot silenced, event, sockets) happens in that transaction or right after its commit.
const ClaimTicketService = async ({ ticketId, userId, reason, force = false, allowReopen = false, transaction: parent }: Input): Promise<Result> => {
  let oldStatus = "";
  let previousUserId: number | null = null;
  let changed = false;

  const work = async (transaction: Transaction) => {
    const row = await Ticket.findByPk(ticketId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!row) throw new AppError("ERR_NO_TICKET_FOUND", 404);

    oldStatus = row.status;
    previousUserId = row.userId || null;

    // a finished attendance has no attendant to protect: whoever reopens it (and may write in it) becomes the attendant
    if (previousUserId && previousUserId !== userId && row.status !== "closed" && !force) {
      const owner = await User.findByPk(previousUserId, { attributes: ["id", "name"], transaction });
      throw new AppError("ERR_TICKET_ALREADY_ASSIGNED", 409, { ticketId, userId: previousUserId, userName: owner?.name || null });
    }

    if (row.status === "closed") {
      if (!allowReopen) throw new AppError("ERR_TICKET_CLOSED", 409, { ticketId });
      await CheckContactOpenTickets(row.contactId, row.whatsappId);
    }

    const already = previousUserId === userId && row.status === "open" && !row.aiActive && !row.isHistorical;
    if (already) return;

    changed = true;

    // conditional on the owner we just read: a stale writer matches no row instead of overwriting a newer assignment
    const [affected] = await Ticket.update(
      {
        userId,
        status: "open",
        aiActive: false,
        chatbotNodeId: FLOW_DONE,
        aiClaimAt: null,
        ...(row.status === "closed" ? { closedAt: null } : {}),
        // a conversation copied from the phone's history becomes a real one, counted from this moment
        ...(row.isHistorical ? { isHistorical: false, firstResponseAt: null } : {})
      } as any,
      { where: { id: ticketId, userId: previousUserId === null ? { [Op.is]: null } : previousUserId } as any, transaction }
    );
    if (!affected) throw new AppError("ERR_TICKET_ALREADY_ASSIGNED", 409, { ticketId });
    if (row.isHistorical) await Ticket.update({ createdAt: new Date() } as any, { where: { id: ticketId }, silent: true, transaction } as any);

    // whatever the robot had waiting for an answer is over: nothing resumes after a person took over
    await ChatFlowRun.update({ status: "done" }, { where: { ticketId, status: { [Op.in]: ["waiting", "delayed"] } } as any, transaction });

    if (previousUserId !== userId) {
      await TicketEvent.create(
        {
          ticketId,
          type: force && previousUserId ? "takeover" : "assigned",
          actorId: userId,
          fromUserId: previousUserId,
          toUserId: userId,
          fromQueueId: row.queueId || null,
          toQueueId: row.queueId || null,
          note: reason === "send" ? "Atribuída ao enviar a primeira mensagem" : null
        } as any,
        { transaction }
      );
    }

    afterCommit(() => {
      fire("ticket.assigned", { ticketId, contactId: row.contactId, userId });
      // the robot's timers belong to this process and are cleared once the new state is durable
      // (a timer that fires before that is stopped by the fresh check right before each robot message)
      silenceRobot(ticketId).catch(() => undefined);
      if (!changed) return;
      notify(ticketId, oldStatus, previousUserId, userId).catch(err => logger.warn(`Claim of ticket ${ticketId}: notification failed: ${err}`));
    });
  };

  if (parent) await work(parent);
  else await sequelize.transaction(work);

  const ticket = await ShowTicketService(ticketId);
  return { ticket, changed, previousUserId };
};

export default ClaimTicketService;
