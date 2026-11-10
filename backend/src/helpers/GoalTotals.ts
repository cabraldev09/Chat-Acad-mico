import { Op } from "sequelize";
import Goal from "../models/Goal";
import GoalPolo from "../models/GoalPolo";
import Lead from "../models/Lead";
import { logger } from "../utils/logger";
import { getSetting, setSetting } from "./AppSettings";
import { dayBounds } from "./AppTime";

// "Já realizado" used to be typed as what is OUTSIDE the CRM, and the enrollments the CRM counts were added on top: the administration typed 84 and the
// table showed 85. It is now the total of the polo (the CRM is inside it). Lines saved before that change were typed as totals, so each one gives back
// the enrollments the CRM counts (the total shown is the number that was typed) and keeps the students in course as typed (the cancelled follow).
// Once, and only for lines nobody saved after the change went live.
const KEY = "goal_total_semantics_v1";
const LIVE_SINCE = new Date("2026-10-20T15:51:00Z");

export const migrateGoalTotals = async (): Promise<number> => {
  try {
    if ((await getSetting(KEY, "")) === "1") return 0;
    let changed = 0;
    const goals = await Goal.findAll({ where: { kind: "polo" } as any });
    for (const goal of goals) {
      const start = dayBounds(goal.startsOn).start;
      const end = dayBounds(goal.endsOn).end;
      // eslint-disable-next-line no-await-in-loop
      const won = (await Lead.findAll({ where: { isHistorical: false, poloId: { [Op.ne]: null } as any, wonAt: { [Op.gte]: start, [Op.lte]: end } as any }, attributes: ["poloId"], raw: true })) as any[];
      const auto = new Map<number, number>();
      won.forEach(r => auto.set(r.poloId, (auto.get(r.poloId) || 0) + 1));
      // eslint-disable-next-line no-await-in-loop
      const lines = await GoalPolo.findAll({ where: { goalId: goal.id } });
      for (const line of lines) {
        const a = auto.get(line.poloId) || 0;
        if (!a || !line.manualCount || new Date(line.updatedAt as any) >= LIVE_SINCE) continue;
        const typedTotal = line.manualCount;
        const inCourse = Math.max(0, a + typedTotal - (line.canceled || 0));
        const manual = Math.max(0, typedTotal - a);
        const done = a + manual;
        // eslint-disable-next-line no-await-in-loop
        await GoalPolo.update({ manualCount: manual, canceled: Math.max(0, done - inCourse) }, { where: { id: line.id }, silent: true } as any);
        changed += 1;
      }
    }
    await setSetting(KEY, "1");
    if (changed) logger.info(`Metas: ${changed} polo(s) com o realizado digitado agora é o total mostrado`);
    return changed;
  } catch (err) {
    logger.warn(`Metas: ajuste do total não aplicado: ${err}`);
    return 0;
  }
};
