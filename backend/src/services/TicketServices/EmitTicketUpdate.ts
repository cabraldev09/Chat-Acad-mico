import { getIO } from "../../libs/socket";
import ShowTicketService from "./ShowTicketService";
import { logger } from "../../utils/logger";

// The conversation changed without going through UpdateTicketService (a person took it, the agent left, a closed chat came back): the open
// conversation and every list hear about it, so what is on the screen is never behind what is in the database.
const emitTicketUpdate = async (ticketId: number | string): Promise<void> => {
  try {
    const ticket = await ShowTicketService(String(ticketId));
    getIO().to(ticket.status).to(String(ticket.id)).to("notification").emit("ticket", { action: "update", ticket });
  } catch (err) {
    logger.warn(`Ticket update ${ticketId} was not sent: ${err}`);
  }
};

export default emitTicketUpdate;
