import { Op } from "sequelize";

import Lead from "../models/Lead";
import LeadTask from "../models/LeadTask";
import User from "../models/User";
import { getSetting } from "../helpers/AppSettings";
import { getIO } from "../libs/socket";
import { logger } from "../utils/logger";
import { addActivity } from "../services/CrmServices/LeadCore";
import LeadReminderLog from "../models/LeadReminderLog";
import { guardedInterval } from "./guardedInterval";

// A student waiting for the tutor longer than the SLA (setting onboarding_sla_hours, default 24h)
// raises one alert to the tutor, and one task plus a live notice to every administrator and coordinator (so nobody misses it even when
// not looking at the screen).
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
    // a few hours before the limit the tutor is reminded once (the managers only hear when it is really late)
    const lead4 = Math.min(4, Math.floor(hours / 3));
    const soon = await Lead.findAll({
      where: {
        onboardingStatus: "pending",
        onboardingTutorId: { [Op.ne]: null },
        onboardingAlertAt: { [Op.is]: null as any },
        enrolledAt: { [Op.lt]: new Date(Date.now() - (hours - lead4) * 3600000), [Op.gte]: new Date(Date.now() - hours * 3600000) }
      } as any,
      limit: 50
    });
    for (const lead of soon) {
      const key = `onboarding-soon:${lead.id}`;
      // eslint-disable-next-line no-await-in-loop
      if (await LeadReminderLog.findOne({ where: { leadId: lead.id, key } })) continue;
      // eslint-disable-next-line no-await-in-loop
      await LeadReminderLog.create({ leadId: lead.id, key } as any);
      getIO().emit("onboardingReminder", { leadId: lead.id, leadName: lead.name, tutorId: lead.onboardingTutorId, hours, left: lead4 });
    }
    const managers = late.length ? await User.findAll({ where: { [Op.or]: [{ profile: "admin" }, { role: ["admin", "coordenacao"] }] } as any, attributes: ["id"] }) : [];
    for (const lead of late) {
      // eslint-disable-next-line no-await-in-loop
      await lead.update({ onboardingAlertAt: new Date() });
      // eslint-disable-next-line no-await-in-loop
      await addActivity(lead.id, null, "system", `Ambientação pendente há mais de ${hours} horas: o tutor ainda não iniciou.`);
      for (const m of managers) {
        // eslint-disable-next-line no-await-in-loop
        await LeadTask.create({ leadId: lead.id, userId: m.id, type: "whatsapp", title: `Ambientação atrasada: ${lead.name} está há mais de ${hours} horas sem o primeiro contato do tutor`, dueAt: new Date() } as any).catch(() => undefined);
      }
      getIO().emit("onboardingAlert", { leadId: lead.id, leadName: lead.name, tutorId: lead.onboardingTutorId, hours });
    }
  } catch (err) {
    logger.warn(`Onboarding SLA tick failed: ${err}`);
  }
};

export const startOnboardingSla = (): void => {
  guardedInterval("OnboardingSla", tick, Number(process.env.ONBOARDING_SLA_MS) || 10 * 60 * 1000);
};
