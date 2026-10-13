import { Op } from "sequelize";

import Lead from "../models/Lead";
import { getSetting } from "../helpers/AppSettings";
import { getIO } from "../libs/socket";
import { logger } from "../utils/logger";
import { addActivity } from "../services/CrmServices/LeadCore";

// A student waiting for the tutor longer than the SLA (setting onboarding_sla_hours, default 24h)
// raises one alert to the tutor and the coordination.
const tick = async (): Promise<void> => {
  try {
    const hours = Math.max(1, Number(await getSetting("onboarding_sla_hours", "24")) || 24);
    const late = await Lead.findAll({
      where: {
        onboardingStatus: "pending",
        onboardingAlertAt: { [Op.is]: null as any },
        enrolledAt: { [Op.lt]: new Date(Date.now() - hours * 3600000) }
      },
      limit: 50
    });
    for (const lead of late) {
      // eslint-disable-next-line no-await-in-loop
      await lead.update({ onboardingAlertAt: new Date() });
      // eslint-disable-next-line no-await-in-loop
      await addActivity(lead.id, null, "system", `Ambientação pendente há mais de ${hours} horas: o tutor ainda não iniciou.`);
      getIO().emit("onboardingAlert", { leadId: lead.id, leadName: lead.name, tutorId: lead.onboardingTutorId, hours });
    }
  } catch (err) {
    logger.warn(`Onboarding SLA tick failed: ${err}`);
  }
};

export const startOnboardingSla = (): void => {
  setInterval(tick, 10 * 60 * 1000);
};
