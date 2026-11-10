import { Op } from "sequelize";

import Ticket from "../models/Ticket";
import { getSetting } from "../helpers/AppSettings";
import { remindWaiting, remindAiWaiting } from "../services/AutomationServices/RunInboundAutomation";
import AiAgent from "../models/AiAgent";
import { policyOf } from "../services/AiServices/Policy";
import { logger } from "../utils/logger";

// One gentle nudge for people who stopped answering the bot's menu or question.
// Setting chatbot_reminder_minutes (default 30; 0 turns it off).
let running = false;
const cursors = new Map<number, number>();
export const tick = async (): Promise<void> => {
  if (running) return;
  running = true;
  try {
    const agents = await AiAgent.findAll({ where: { active: true } });
    for (const agent of agents.filter(a => policyOf(a.persona).followUp.enabled)) {
      const minutes = policyOf(agent.persona).followUp.minutes;
      const waiting = await Ticket.findAll({
        where: {
          id: { [Op.gt]: cursors.get(agent.id) || 0 },
          status: { [Op.ne]: "closed" }, userId: { [Op.is]: null }, aiActive: true,
          isGroup: false, isHistorical: false, aiTurns: { [Op.gt]: 0 },
          botReminderAt: { [Op.is]: null }, lastMessageFromMe: true,
          lastMessageAt: { [Op.lt]: new Date(Date.now() - minutes * 60000), [Op.gt]: new Date(Date.now() - 23 * 3600000) },
          ...(agent.queueId ? { queueId: agent.queueId } : {}),
          ...(agent.whatsappId ? { whatsappId: agent.whatsappId } : {})
        } as any, order: [["id", "ASC"]], limit: 50
      });
      cursors.set(agent.id, waiting.length === 50 ? waiting[waiting.length - 1].id : 0);
      for (const t of waiting) await remindAiWaiting(t.id).catch(err => logger.warn(`AI reminder failed: ${err}`));
    }
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
  } finally {
    running = false;
  }
};

export const startChatbotReminder = (): void => {
  setInterval(tick, 60 * 1000);
};
