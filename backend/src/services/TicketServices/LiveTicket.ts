import { Op } from "sequelize";
import Ticket from "../../models/Ticket";
import { mergeTicketRows } from "../../helpers/mergeTickets";

// One live conversation per person and per number (the unique index tickets_one_live_per_number keeps it so). These are the two ways
// of getting it without ever making a second one.

// the person's live conversation on this number, whatever its side and state (the newest when, before the index, there were two)
export const liveTicketOf = (contactId: number, whatsappId: number): Promise<Ticket | null> =>
  Ticket.findOne({ where: { contactId, whatsappId, isGroup: false, isHistorical: false } as any, order: [["updatedAt", "DESC"]] });

// creates the conversation; when another one was born at the same moment (two messages together, a double click), that one is used
export const createLiveTicket = async (values: Record<string, unknown>): Promise<Ticket> => {
  try {
    return await Ticket.create(values as any);
  } catch (err: any) {
    if (err && err.name === "SequelizeUniqueConstraintError" && !values.isGroup) {
      const existing = await liveTicketOf(Number(values.contactId), Number(values.whatsappId));
      if (existing) return existing;
    }
    throw err;
  }
};

export const isLive = { isGroup: false, isHistorical: false, status: { [Op.in]: ["open", "pending"] } };

// Joins conversations of the same person on the same number into one (see mergeTicketRows). Used when two contacts of the same person
// become one (WhatsApp changed the person's id).
export const mergeTicketsInto = async (keepId: number, otherIds: number[]): Promise<void> => {
  const others = otherIds.filter(id => id && id !== keepId);
  if (!others.length) return;
  const s = Ticket.sequelize as any;
  await s.transaction(async (transaction: any) => {
    await mergeTicketRows((sql, replacements) => s.query(sql, { transaction, replacements }), keepId, others);
  });
};
