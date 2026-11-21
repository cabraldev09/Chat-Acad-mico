import { randomUUID } from "crypto";
import { Op, UniqueConstraintError, Transaction } from "sequelize";

import sequelize from "../../database";
import AppError from "../../errors/AppError";
import { getIO } from "../../libs/socket";
import { logger } from "../../utils/logger";
import Message from "../../models/Message";
import OutboundMessage from "../../models/OutboundMessage";
import SetTicketMessagesAsRead from "../../helpers/SetTicketMessagesAsRead";
import ActivateForSending from "../TicketServices/ActivateForSending";
import ShowTicketService from "../TicketServices/ShowTicketService";
import SendWhatsAppMedia from "../WbotServices/SendWhatsAppMedia";
import SendWhatsAppMessage from "../WbotServices/SendWhatsAppMessage";
import { touchAnalytics } from "../AnalyticsServices/Realtime";
import { hookHumanReply } from "../CrmServices/LeadCore";

const MAX_ATTEMPTS = 3;
// a send that was taken and never finished: it may or may not have reached the phone, so it is reported, never repeated
const STUCK_MS = 2 * 60 * 1000;

export interface OutboundMedia {
  path: string;
  filename: string;
  originalname: string;
  mimetype: string;
  size: number;
  caption?: string;
}

interface EnqueueInput {
  ticketId: number;
  userId: number;
  clientKey?: string;
  body?: string;
  quotedMsgId?: string;
  medias?: OutboundMedia[];
}

// One locked write: the sender becomes the attendant (or the send is refused) and the intention to send is stored.
// The same clientKey twice answers with the first row and sends nothing more.
export const enqueueOutbound = async ({ ticketId, userId, clientKey, body, quotedMsgId, medias }: EnqueueInput): Promise<{ row: OutboundMessage; duplicate: boolean }> => {
  const key = String(clientKey || randomUUID()).slice(0, 100);
  const existing = await OutboundMessage.findOne({ where: { ticketId, clientKey: key } });
  if (existing) {
    if (existing.userId !== userId) throw new AppError("ERR_FORBIDDEN_CLIENT_KEY", 409);
    return { row: existing, duplicate: true };
  }

  try {
    const row = await sequelize.transaction(async (transaction: Transaction) => {
      const ticket = await ShowTicketService(ticketId);
      const claimed = await ActivateForSending(ticket, userId, transaction);
      const created = await OutboundMessage.create(
        {
          ticketId,
          userId,
          clientKey: key,
          // groups have no single attendant: the owner check at send time applies to the other conversations only
          payload: { body: body || "", quotedMsgId: quotedMsgId || null, medias: medias || [], requireOwner: !claimed.isGroup },
          status: "pending",
          attempts: 0
        } as any,
        { transaction }
      );
      return created;
    });
    return { row, duplicate: false };
  } catch (err) {
    if (err instanceof UniqueConstraintError) {
      const winner = await OutboundMessage.findOne({ where: { ticketId, clientKey: key } });
      if (winner && winner.userId === userId) return { row: winner, duplicate: true };
    }
    throw err;
  }
};

const fail = async (row: OutboundMessage, reason: string): Promise<void> => {
  await row.update({ status: "failed", error: reason.slice(0, 1000), lockedAt: null });
  getIO().to(`user:${row.userId}`).emit("outboundMessage", { action: "failed", ticketId: row.ticketId, id: row.id, clientKey: row.clientKey, error: reason });
};

// Takes one pending row (only one worker wins it) and makes the outside call. At most once per row.
export const processOutbound = async (id: number): Promise<void> => {
  const [taken, rows] = await OutboundMessage.update(
    { status: "sending", lockedAt: new Date(), attempts: sequelize.literal('"attempts" + 1') as any } as any,
    { where: { id, status: "pending", [Op.or]: [{ nextAttemptAt: null }, { nextAttemptAt: { [Op.lte]: new Date() } }] } as any, returning: true }
  );
  if (!taken) return;
  const row = rows[0];
  const payload = row.payload || {};

  try {
    const ticket = await ShowTicketService(row.ticketId);
    // the conversation may have changed hands since the send was stored: what a person wrote for it is not sent by the new owner's name
    if (payload.requireOwner && ticket.userId !== row.userId) {
      await fail(row, "ownership_changed");
      return;
    }
    SetTicketMessagesAsRead(ticket);
    const quotedMsg = payload.quotedMsgId ? await Message.findByPk(payload.quotedMsgId) : undefined;
    let providerId: string | undefined;
    // each piece has its own delivery key: a retry after the 2nd file failed does not send the 1st again (it answers with the first send)
    if (payload.medias?.length) {
      // sequential: keeps the order the agent chose and paces unofficial connections
      const medias = payload.medias as OutboundMedia[];
      for (let i = 0; i < medias.length; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        const sent = await SendWhatsAppMedia({ media: medias[i] as any, ticket, body: (medias[i].caption || "").trim() || undefined, deliveryKey: `outbound:${row.id}:${i}` });
        providerId = sent?.id || providerId;
      }
    } else {
      const sent = await SendWhatsAppMessage({ body: payload.body, ticket, quotedMsg: quotedMsg || undefined, deliveryKey: `outbound:${row.id}` });
      providerId = sent?.id;
    }
    // only a row still in "sending" changes (the sweep may have reported it meanwhile)
    await OutboundMessage.update({ status: "sent", sentAt: new Date(), providerMsgId: providerId || null, lockedAt: null, error: null } as any, { where: { id: row.id, status: "sending" } as any });
    touchAnalytics(row.userId);
    hookHumanReply(ticket.contactId, row.userId);
  } catch (err) {
    const reason = String((err as any)?.message || err);
    // not retried: a refusal that will not change (closed reply window) and a send that may already have reached the phone
    // (ERR_DELIVERY_UNCERTAIN: the delivery of this key started and was not confirmed) — the person checks the conversation
    const final = ["ERR_REPLY_WINDOW_CLOSED", "ERR_DELIVERY_UNCERTAIN", "ERR_DELIVERY_KEY_CONFLICT"].includes(reason);
    if (!final && row.attempts < MAX_ATTEMPTS) {
      // the call failed before WhatsApp accepted it: try again soon (only while the row is still ours: a row the sweep reported stays reported)
      await OutboundMessage.update({ status: "pending", lockedAt: null, error: reason.slice(0, 1000), nextAttemptAt: new Date(Date.now() + 5000 * row.attempts) } as any, { where: { id: row.id, status: "sending" } as any });
    } else {
      const [mine] = await OutboundMessage.update({ status: "sending" } as any, { where: { id: row.id, status: "sending" } as any });
      if (mine) await fail(row, reason === "ERR_DELIVERY_UNCERTAIN" ? "Não foi possível confirmar o envio. Confira a conversa antes de enviar de novo." : reason);
    }
  }
};

// Safety net: picks up sends whose first attempt did not run here (restart, retry after a failed call) and reports the stuck ones.
export const sweepOutbound = async (): Promise<void> => {
  const stuck = await OutboundMessage.findAll({ where: { status: "sending", lockedAt: { [Op.lt]: new Date(Date.now() - STUCK_MS) } } as any });
  for (const row of stuck) {
    // eslint-disable-next-line no-await-in-loop
    await fail(row, "Não foi possível confirmar o envio. Confira a conversa antes de enviar de novo.");
  }
  const due = await OutboundMessage.findAll({
    where: { status: "pending", [Op.or]: [{ nextAttemptAt: null }, { nextAttemptAt: { [Op.lte]: new Date() } }] } as any,
    order: [["id", "ASC"]],
    limit: 20,
    attributes: ["id"]
  });
  for (const row of due) {
    // eslint-disable-next-line no-await-in-loop
    await processOutbound(row.id);
  }
};
