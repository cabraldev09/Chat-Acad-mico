import { chatIdOf } from "./ChatId";
import Message from "../models/Message";
import Ticket from "../models/Ticket";

const SerializeWbotMsgId = (ticket: Ticket, message: Message): string => {
  const serializedMsgId = `${message.fromMe}_${chatIdOf(ticket.contact, ticket.isGroup)}_${message.id}`;

  return serializedMsgId;
};

export default SerializeWbotMsgId;
