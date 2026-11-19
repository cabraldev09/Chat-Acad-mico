import { Op } from "sequelize";

import { getSetting, setSetting } from "../../helpers/AppSettings";
import { getAppTz } from "../../helpers/AppTime";
import { applyPoloImport } from "../../controllers/GoalController";
import Goal from "../../models/Goal";
import GoalPolo from "../../models/GoalPolo";
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

// The goal of the 1st semester of 2027 (the intake that opened on 17/11/2026 and closes on 03/05/2027), with the target of each polo
// as the administration set it. Created once; the done comes from the CRM (enrollments from the 17th on). Editing or deleting it later
// is not undone.
export const GOAL_2027_1 = {
  title: "Graduação 1º semestre de 2027",
  startsOn: "2026-11-17",
  endsOn: "2027-05-03",
  polos: [
    { code: "8311", name: "Vilhena - Centro (S-01) - RO", target: 150 },
    { code: "8809", name: "Porto Velho (Juscelino Kubitschek) - RO", target: 150 },
    { code: "1959", name: "Cerejeiras - Jardim Liberdade - RO", target: 77 },
    { code: "2042", name: "Mirante da Serra - Centro - RO", target: 56 },
    { code: "2085", name: "Porto Velho - Centro - RO", target: 38 },
    { code: "8251", name: "Chupinguaia - Centro - RO", target: 34 },
    { code: "1893", name: "Buritis - Setor 02 - RO", target: 29 },
    { code: "2027", name: "Alto Alegre dos Parecis - Centro - RO", target: 26 }
  ]
};

export const seedGoal20271 = async (): Promise<Goal | null> => {
  try {
    if (process.env.SKIP_DEFAULT_DATA === "1") return null;
    if ((await getSetting("goal_2027_1_seeded", "")) === "1") return null;
    const existing = await Goal.findOne({ where: { kind: "polo", startsOn: GOAL_2027_1.startsOn, endsOn: GOAL_2027_1.endsOn } as any });
    const goal = existing || (await Goal.create({ title: GOAL_2027_1.title, startsOn: GOAL_2027_1.startsOn, endsOn: GOAL_2027_1.endsOn, kind: "polo", workDays: 5 } as any));
    // only the targets are set: what the CRM counts stays the done (the import would turn a "done 0" into a negative correction)
    const before = new Map((await GoalPolo.findAll({ where: { goalId: goal.id } })).map(r => [r.poloId, r.manualCount || 0]));
    const out = await applyPoloImport(goal, GOAL_2027_1.polos, false);
    for (const row of await GoalPolo.findAll({ where: { goalId: goal.id } })) {
      // eslint-disable-next-line no-await-in-loop
      await row.update({ manualCount: before.get(row.poloId) || 0 } as any);
    }
    await setSetting("goal_2027_1_seeded", "1");
    logger.info(`Goal ${GOAL_2027_1.title}: ${out.updated} polos updated, ${out.created} created`);
    return goal;
  } catch (err) {
    logger.error(`Creating the goal of the 1st semester of 2027 failed: ${err}`);
    return null;
  }
};
