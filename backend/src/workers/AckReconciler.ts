import { Op } from "sequelize";

import Message from "../models/Message";
import Ticket from "../models/Ticket";
import Contact from "../models/Contact";
import Whatsapp from "../models/Whatsapp";
import { chatIdOf } from "../helpers/ChatId";
import { whatsappProvider } from "../providers/WhatsApp";
import { handleMessageAck } from "../handlers/handleWhatsappEvents";
import { logger } from "../utils/logger";

let running = false;

// The clock (✓ not yet confirmed) must not stay forever when WhatsApp's "delivered"/"read" event was missed
// (reconnection, event arriving before the message was saved...). Every half minute the real state of the latest
// messages that are still unconfirmed is asked to the phone. Only a few at a time, so WhatsApp is never flooded.
const tick = async (): Promise<void> => {
  if (running || !whatsappProvider.getMessageAck) return;
  running = true;
  try {
    const now = Date.now();
    const rows = await Message.findAll({
      where: {
        fromMe: true,
        isDeleted: false,
        [Op.or]: [
          // still on the clock after 15 s (up to a week back)
          { ack: 0, createdAt: { [Op.between]: [new Date(now - 7 * 86400000), new Date(now - 15000)] } },
          // sent or delivered in the last 20 minutes: delivery/read may have been missed
          { ack: { [Op.in]: [1, 2] }, createdAt: { [Op.gte]: new Date(now - 20 * 60000) } }
        ]
      } as any,
      include: [
        {
          model: Ticket,
          as: "ticket",
          attributes: ["id", "whatsappId", "isGroup", "contactId"],
          required: true,
          include: [{ model: Contact, as: "contact", attributes: ["id", "number", "lid", "isGroup"] }]
        }
      ],
      order: [["createdAt", "DESC"]],
      limit: 30
    });
    if (!rows.length) return;

    const connected = new Set(
      (await Whatsapp.findAll({ where: { status: "CONNECTED", channel: "whatsapp" }, attributes: ["id"] })).map(w => w.id)
    );
    for (const m of rows) {
      const { ticket } = m;
      if (!connected.has(ticket.whatsappId)) continue;
      try {
        const chatId = chatIdOf(ticket.contact, ticket.isGroup);
        // eslint-disable-next-line no-await-in-loop
        const real = await whatsappProvider.getMessageAck(ticket.whatsappId, chatId, m.id, true);
        if (real !== null && real > (m.ack || 0)) {
          // same path as the live event: updates the message, the list and the screens
          // eslint-disable-next-line no-await-in-loop
          await handleMessageAck(m.id, real as any);
        } else if (real === null && m.ack === 0 && now - new Date(m.createdAt).getTime() > 10 * 60000) {
          // gone from the phone's recent history: it was sent, so stop showing the clock
          // eslint-disable-next-line no-await-in-loop
          await handleMessageAck(m.id, 1);
        }
      } catch (err) {
        // one message failing must not stop the others
      }
      // eslint-disable-next-line no-await-in-loop
      await new Promise(r => setTimeout(r, 400));
    }
  } catch (err) {
    logger.warn(`Ack reconcile tick failed: ${err}`);
  } finally {
    running = false;
  }
};

export const startAckReconciler = (): void => {
  setInterval(tick, 30000);
};
