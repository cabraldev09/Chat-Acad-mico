import { Op } from "sequelize";

import Ticket from "../models/Ticket";
import { getSetting } from "../helpers/AppSettings";
import { remindWaiting } from "../services/AutomationServices/RunInboundAutomation";
import { logger } from "../utils/logger";
import { guardedInterval } from "./guardedInterval";

// One gentle nudge for people who stopped answering the bot's menu or question.
// Setting chatbot_reminder_minutes (default 30; 0 turns it off).
const tick = async (): Promise<void> => {
  try {
    const minutes = Number(await getSetting("chatbot_reminder_minutes", "30"));
    if (!minutes || minutes < 1) return;
    const stale = await Ticket.findAll({
      where: {
        status: "pending",
        userId: { [Op.is]: null },
        chatbotNodeId: { [Op.gt]: 0 },
        botReminderAt: { [Op.is]: null },
        updatedAt: { [Op.lt]: new Date(Date.now() - minutes * 60000) }
      } as any,
      limit: 20
    });
    for (const t of stale) {
      // eslint-disable-next-line no-await-in-loop
      await remindWaiting(t.id).catch(err => logger.warn(`reminder failed: ${err}`));
    }
  } catch (err) {
    logger.error(`Chatbot reminder error: ${err}`);
  }
};

export const startChatbotReminder = (): void => {
  guardedInterval("ChatbotReminder", tick, 5 * 60 * 1000);
};
