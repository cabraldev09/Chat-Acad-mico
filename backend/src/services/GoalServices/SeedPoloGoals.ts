import { Op } from "sequelize";

import { getSetting, setSetting } from "../../helpers/AppSettings";
import { getAppTz } from "../../helpers/AppTime";
import { applyPoloImport } from "../../controllers/GoalController";
import Goal from "../../models/Goal";
import { logger } from "../../utils/logger";

// The polos and the numbers the administration already keeps in its spreadsheet (code, polo, target, done, cancelled).
// Loaded once, the first time the system starts with no polo goal: the screen of goals by polo is never empty and the
// administration only edits. Deleting the semester later does not bring it back.
const SHEET = [
  { code: "1893", name: "Buritis - Setor 02 - RO", target: 70, done: 11, canceled: 0 },
  { code: "1959", name: "Cerejeiras - Jardim Liberdade - RO", target: 60, done: 41, canceled: 4 },
  { code: "2027", name: "Alto Alegre dos Parecis - Centro - RO", target: 50, done: 31, canceled: 4 },
  { code: "2042", name: "Mirante da Serra - Centro - RO", target: 60, done: 18, canceled: 5 },
  { code: "2085", name: "Porto Velho - Centro - RO", target: 80, done: 77, canceled: 15 },
  { code: "8251", name: "Chupinguaia - Centro - RO", target: 60, done: 36, canceled: 3 },
  { code: "8311", name: "Vilhena - Centro (S-01) - RO", target: 80, done: 117, canceled: 23 },
  { code: "8809", name: "Porto Velho (Juscelino Kubitschek) - RO", target: 90, done: 69, canceled: 7 }
];

export const seedPoloGoals = async (): Promise<void> => {
  try {
    // tests start from an empty system
    if (process.env.SKIP_DEFAULT_DATA === "1") return;
    if ((await getSetting("polo_goals_seeded", "")) === "1") return;
    if (await Goal.count({ where: { kind: "polo", status: { [Op.ne]: "deleted" } } as any })) {
      await setSetting("polo_goals_seeded", "1");
      return;
    }
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: getAppTz() }).format(new Date());
    const year = Number(today.slice(0, 4));
    const second = Number(today.slice(5, 7)) >= 7;
    const goal = await Goal.create({
      title: `Graduação ${second ? 2 : 1}º semestre de ${year}`,
      startsOn: `${year}-${second ? "07-01" : "01-01"}`,
      endsOn: `${year}-${second ? "12-31" : "06-30"}`,
      kind: "polo",
      workDays: 5
    } as any);
    const out = await applyPoloImport(goal, SHEET, false);
    await setSetting("polo_goals_seeded", "1");
    logger.info(`Polo goals loaded: ${out.updated} polos updated, ${out.created} created`);
  } catch (err) {
    logger.error(`Seeding the polo goals failed: ${err}`);
  }
};
