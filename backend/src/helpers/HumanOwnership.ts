import Ticket from "../models/Ticket";

// Fresh read (never the copy a job loaded seconds ago): a person owns the conversation, so no robot may answer it.
export const humanHasTicket = async (ticketId: number): Promise<boolean> => {
  const row = await Ticket.findByPk(ticketId, { attributes: ["id", "userId"] });
  return !!row?.userId;
};
