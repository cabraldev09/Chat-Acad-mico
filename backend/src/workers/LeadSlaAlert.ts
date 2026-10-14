import { Op } from "sequelize";

import Lead from "../models/Lead";
import LeadStage from "../models/LeadStage";
import { getIO } from "../libs/socket";
import { getSetting } from "../helpers/AppSettings";
import { getBusinessConfig, isBusinessNow, businessMinutes } from "../helpers/BusinessTime";
import { addActivity } from "../services/CrmServices/LeadCore";
import { logger } from "../utils/logger";

// A new lead nobody has answered after X minutes (counted only inside working hours) raises one alert:
// a note in the lead's history and a live notice for the owner and the managers.
const tick = async (): Promise<void> => {
  try {
    const minutes = Number(await getSetting("crm_sla_minutes", "15"));
    if (!minutes) return;
    const business = await getBusinessConfig();
    if (!isBusinessNow(business)) return;

    const now = new Date();
    const leads = await Lead.findAll({
      where: {
        firstContactAt: null as any,
        slaAlertedAt: null as any,
        isHistorical: false,
        // only recent leads: older ones were already handled (or lost) by the team
        createdAt: { [Op.lte]: new Date(now.getTime() - minutes * 60000), [Op.gte]: new Date(now.getTime() - 48 * 3600000) }
      },
      include: [{ model: LeadStage, as: "stage", where: { type: "open" }, attributes: ["id"], required: true }],
      limit: 100
    });

    for (const lead of leads) {
      const waited = businessMinutes(business, lead.createdAt, now);
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
  setInterval(tick, 60000);
};

export { tick as runLeadSlaAlertOnce };
