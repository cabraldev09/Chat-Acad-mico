import { Op } from "sequelize";
import Ticket from "../models/Ticket";
import Contact from "../models/Contact";
import Whatsapp from "../models/Whatsapp";
import { whatsappProvider } from "../providers/WhatsApp";
import { chatIdOf } from "../helpers/ChatId";
import { syncChatRead } from "../services/MessageServices/SyncReadState";
import { logger } from "../utils/logger";

let busy = false;
let cursor = 0;
export const reconcileUnread = async (): Promise<void> => {
  if (busy || !whatsappProvider.getChatUnreadCount) return;
  busy = true;
  try {
    const rows = await Ticket.findAll({
      where: { id: { [Op.gt]: cursor }, unreadMessages: { [Op.gt]: 0 } },
      include: [{ model: Contact, as: "contact", required: true }, { model: Whatsapp, as: "whatsapp", required: true, where: { channel: "whatsapp", status: "CONNECTED" } }],
      order: [["id", "ASC"]], limit: 30
    });
    if (!rows.length) cursor = 0;
    for (const ticket of rows) {
      cursor = ticket.id;
      const observedAt = new Date();
      try {
        const chatId = chatIdOf(ticket.contact, ticket.isGroup);
        const count = await whatsappProvider.getChatUnreadCount(ticket.whatsappId, chatId);
        if (count === 0) await syncChatRead(ticket.whatsappId, chatId, observedAt);
      } catch (err) { logger.debug(`Unread reconciliation ${ticket.id}: ${err.message}`); }
    }
  } finally { busy = false; }
};
export const startUnreadReconciler = (): void => {
  reconcileUnread().catch(err => logger.warn(`Unread reconciliation: ${err.message}`));
  setInterval(() => reconcileUnread().catch(err => logger.warn(`Unread reconciliation: ${err.message}`)), 30000);
};
