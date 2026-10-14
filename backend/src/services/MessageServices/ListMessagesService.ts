import AppError from "../../errors/AppError";
import Message from "../../models/Message";
import Ticket from "../../models/Ticket";
import ShowTicketService from "../TicketServices/ShowTicketService";

interface Request {
  ticketId: string;
  pageNumber?: string;
}

interface Response {
  messages: Message[];
  ticket: Ticket;
  count: number;
  hasMore: boolean;
}

const ListMessagesService = async ({
  pageNumber = "1",
  ticketId
}: Request): Promise<Response> => {
  const ticket = await ShowTicketService(ticketId);

  if (!ticket) {
    throw new AppError("ERR_NO_TICKET_FOUND", 404);
  }

  // await setMessagesAsRead(ticket);
  const limit = 20;
  const offset = limit * (+pageNumber - 1);

  // one extra row tells whether there is another page, instead of a COUNT over the whole conversation
  // (the index on ticketId + createdAt makes this a short walk even in groups with years of messages)
  const rows = await Message.findAll({
    where: { ticketId },
    limit: limit + 1,
    include: [
      "contact",
      {
        model: Message,
        as: "quotedMsg",
        include: ["contact"]
      }
    ],
    offset,
    order: [["createdAt", "DESC"]]
  });

  const hasMore = rows.length > limit;
  const messages = rows.slice(0, limit);

  return {
    messages: messages.reverse(),
    ticket,
    count: offset + messages.length + (hasMore ? 1 : 0),
    hasMore
  };
};

export default ListMessagesService;
