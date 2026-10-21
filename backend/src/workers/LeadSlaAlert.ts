import { Op } from "sequelize";

import Lead from "../models/Lead";
import LeadStage from "../models/LeadStage";
import Ticket from "../models/Ticket";
import Message from "../models/Message";
import { getIO } from "../libs/socket";
import { getSetting } from "../helpers/AppSettings";
import { getBusinessConfig, isBusinessNow, businessMinutes } from "../helpers/BusinessTime";
import { addActivity } from "../services/CrmServices/LeadCore";
import { logger } from "../utils/logger";
import { guardedInterval } from "./guardedInterval";

// A new lead nobody has answered after X minutes (counted only inside working hours) raises one alert:
// a note in the lead's history and a live notice for the owner and the managers.
const tick = async (): Promise<void> => {
  try {
    const minutes = Number(await getSetting("crm_sla_minutes", "15"));
    if (!minutes) return;
    const business = await getBusinessConfig();
    if (!isBusinessNow(business)) return;

    const now = new Date();
    // candidates: open leads nobody has answered yet, with a message in the last 2 days
    const leads = await Lead.findAll({
      where: {
        firstContactAt: null as any,
        slaAlertedAt: null as any,
        isHistorical: false,
        lastInboundAt: { [Op.gte]: new Date(now.getTime() - 48 * 3600000) }
      },
      include: [{ model: LeadStage, as: "stage", where: { type: "open" }, attributes: ["id"], required: true }],
      limit: 200
    });

    for (const lead of leads) {
      // The clock starts at the first message the person sent after our last reply (never at the moment the
      // lead was registered, which can be much earlier), on the lead's current conversation.
      // eslint-disable-next-line no-await-in-loop
      const ticket = await Ticket.findOne({
        where: { contactId: lead.contactId, isHistorical: false, status: { [Op.ne]: "closed" } },
        order: [["updatedAt", "DESC"]],
        attributes: ["id"]
      });
      if (!ticket) continue;
      // eslint-disable-next-line no-await-in-loop
      const lastReply = (
        await Message.findOne({ where: { ticketId: ticket.id, fromMe: true }, order: [["createdAt", "DESC"]], attributes: ["createdAt"] })
      )?.createdAt;
      // eslint-disable-next-line no-await-in-loop
      const firstWaiting = (
        await Message.findOne({
          where: { ticketId: ticket.id, fromMe: false, ...(lastReply ? { createdAt: { [Op.gt]: lastReply } } : {}) },
          order: [["createdAt", "ASC"]],
          attributes: ["createdAt"]
        })
      )?.createdAt;
      if (!firstWaiting) continue;

      const waited = businessMinutes(business, new Date(firstWaiting), now);
      if (waited >= minutes) {
        // eslint-disable-next-line no-await-in-loop
        await lead.update({ slaAlertedAt: now });
        // eslint-disable-next-line no-await-in-loop
        await addActivity(lead.id, null, "sla", `Sem resposta há ${Math.round(waited)} min${business.enabled ? " de horário comercial" : ""}.`);
        getIO().emit("leadAlert", {
          leadId: lead.id,
          name: lead.name,
          ownerId: lead.ownerId,
          minutes: Math.round(waited),
          channel: lead.channel
        });
      }
    }
  } catch (err) {
    logger.warn(`Lead SLA alert tick failed: ${err}`);
  }
};

export const startLeadSlaAlert = (): void => {
  guardedInterval("LeadSlaAlert", tick, 60000);
};

export { tick as runLeadSlaAlertOnce };
