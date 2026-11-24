import { Op } from "sequelize";

import Message from "../../models/Message";
import Ticket from "../../models/Ticket";
import TicketEvent from "../../models/TicketEvent";
import TicketTag from "../../models/TicketTag";
import { TUTORIA_SEGMENTS } from "../ChannelServices/ConnectionTeam";
import emitTicketUpdate from "./EmitTicketUpdate";
import { logger } from "../../utils/logger";

// A student has one tutoring conversation. When the enrollment opened it on another number (the tutoring number was not set yet) and the
// student then writes to the tutoring number, the empty one is folded into the conversation that has the messages: the handover notes, the
// tags, the lead and the polo's queue move over, and the empty one is closed, so the tutor never sees the same student twice.
// Only an empty conversation (no message at all) is folded: two real conversations on two numbers stay as they are.
export const foldTutoringTwins = async (ticket: Ticket): Promise<number[]> => {
  if (!ticket || ticket.isGroup || !TUTORIA_SEGMENTS.includes(String(ticket.segment || ""))) return [];
  const twins = await Ticket.findAll({
    where: { contactId: ticket.contactId, id: { [Op.ne]: ticket.id }, isGroup: false, status: { [Op.in]: ["open", "pending"] }, segment: { [Op.in]: TUTORIA_SEGMENTS } } as any
  });
  const folded: number[] = [];
  for (const twin of twins) {
    // eslint-disable-next-line no-await-in-loop
    if ((await Message.count({ where: { ticketId: twin.id } })) > 0) continue;
    try {
      // eslint-disable-next-line no-await-in-loop
      await TicketEvent.update({ ticketId: ticket.id } as any, { where: { ticketId: twin.id } });
      // eslint-disable-next-line no-await-in-loop
      const tags = await TicketTag.findAll({ where: { ticketId: twin.id } });
      for (const t of tags) {
        // eslint-disable-next-line no-await-in-loop
        await TicketTag.findOrCreate({ where: { ticketId: ticket.id, tagId: t.tagId }, defaults: { ticketId: ticket.id, tagId: t.tagId } as any });
      }
      // eslint-disable-next-line no-await-in-loop
      await TicketTag.destroy({ where: { ticketId: twin.id } });
      const keep: Record<string, unknown> = {};
      if (!ticket.leadId && twin.leadId) keep.leadId = twin.leadId;
      if (!ticket.queueId && twin.queueId) keep.queueId = twin.queueId;
      // the tutor chosen in the enrollment keeps the student when nobody took the conversation yet
      if (!ticket.userId && twin.userId) Object.assign(keep, { userId: twin.userId, status: "open" });
      if (Object.keys(keep).length) {
        ticket.set(keep as any);
        // eslint-disable-next-line no-await-in-loop
        await ticket.save();
      }
      // eslint-disable-next-line no-await-in-loop
      await twin.update({ status: "closed", closedAt: new Date(), unreadMessages: 0 } as any);
      // eslint-disable-next-line no-await-in-loop
      await TicketEvent.create({ ticketId: ticket.id, type: "merged", actorId: null, note: `A conversa de tutoria nº ${twin.id}, aberta na matrícula e sem mensagens, foi juntada a esta.` } as any);
      folded.push(twin.id);
      // eslint-disable-next-line no-await-in-loop
      await emitTicketUpdate(twin.id);
    } catch (err) {
      logger.warn(`Conversa de tutoria ${twin.id} não foi juntada à ${ticket.id}: ${(err as Error).message}`);
    }
  }
  if (folded.length) await emitTicketUpdate(ticket.id);
  return folded;
};
