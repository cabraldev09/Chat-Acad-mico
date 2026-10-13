import Contact from "../../models/Contact";
import ShowTicketService from "../TicketServices/ShowTicketService";
import SendWhatsAppMessage from "../WbotServices/SendWhatsAppMessage";
import { logger } from "../../utils/logger";
import { optKeyword, BOT_MARK } from "./SendGuard";

// "SAIR" / "PARAR" stop campaigns to that contact; "VOLTAR" turns them back on.
// Returns true when the message was an opt-in/out keyword (nothing else should
// answer it).
const processOptOut = async (ticketId: number, body: string): Promise<boolean> => {
  const keyword = optKeyword(body);
  if (!keyword) return false;

  try {
    const ticket = await ShowTicketService(ticketId);
    if (ticket.isGroup) return false;

    const contact = await Contact.findByPk(ticket.contactId);
    if (!contact) return false;

    const wantsOut = keyword === "out";
    if (Boolean(contact.optOut) === wantsOut) return true;

    await contact.update({
      optOut: wantsOut,
      optOutAt: wantsOut ? new Date() : null
    });

    await SendWhatsAppMessage({
      body:
        BOT_MARK +
        (wantsOut
          ? "Tudo certo, você não receberá mais mensagens em massa da nossa equipe. Se mudar de ideia, responda VOLTAR."
          : "Pronto! Você voltará a receber nossas novidades."),
      ticket,
      automated: true
    });
  } catch (err) {
    logger.error(`Opt-out handling failed: ${err}`);
  }
  return true;
};

export default processOptOut;
