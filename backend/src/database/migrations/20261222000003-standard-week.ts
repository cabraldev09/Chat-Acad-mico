import { QueryInterface, QueryTypes } from "sequelize";

// The team's week: Monday to Thursday 08:00-18:00, Friday 08:00-17:00, no weekend. Applied once to the company hours (turned on) and to
// each consultant, tutor and relationship person who has no hours yet or still has the old default of the user form (Monday to Friday
// 08:00-17:00, the same every day). Hours someone set by hand are kept. The company hours saved before stay in a setting, to go back.
// A fresh database (no users yet: a new installation or the tests) is left alone.
const WEEK = {
  "0": [],
  "1": [{ start: "08:00", end: "18:00" }],
  "2": [{ start: "08:00", end: "18:00" }],
  "3": [{ start: "08:00", end: "18:00" }],
  "4": [{ start: "08:00", end: "18:00" }],
  "5": [{ start: "08:00", end: "17:00" }],
  "6": []
};
const PERSON = Object.fromEntries(Object.entries(WEEK).filter(([, v]) => v.length));
const OLD_FORM = (days: any): boolean => {
  const keys = Object.keys(days || {}).filter(k => (days[k] || []).length).sort();
  return keys.join(",") === "1,2,3,4,5" && keys.every(k => days[k].length === 1 && days[k][0].start === "08:00" && days[k][0].end === "17:00");
};

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const q: any = queryInterface.sequelize;
    const pg = q.getDialect() === "postgres";
    const Q = (id: string): string => (pg ? `"${id}"` : `\`${id}\``);
    const users: Array<{ id: number; role: string }> = await q.query(`SELECT id, role FROM ${Q("Users")}`, { type: QueryTypes.SELECT });
    if (!users.length) return;
    const now = new Date();
    const get = async (key: string): Promise<string | null> => {
      const rows: any[] = await q.query(`SELECT value FROM ${Q("Settings")} WHERE ${Q("key")} = :key`, { type: QueryTypes.SELECT, replacements: { key } });
      return rows.length ? rows[0].value : null;
    };
    const set = async (key: string, value: string): Promise<void> => {
      if ((await get(key)) === null) await queryInterface.bulkInsert("Settings", [{ key, value, createdAt: now, updatedAt: now }]);
      else await q.query(`UPDATE ${Q("Settings")} SET value = :value, ${Q("updatedAt")} = :now WHERE ${Q("key")} = :key`, { replacements: { key, value, now } });
    };

    const before = await get("business_hours");
    if (before !== null && (await get("business_hours_before_20261120")) === null) await set("business_hours_before_20261120", before);
    await set("business_hours", JSON.stringify({ enabled: true, days: WEEK }));

    let cfg: any = {};
    try { cfg = JSON.parse((await get("analytics_config")) || "{}") || {}; } catch { cfg = {}; }
    const schedules = { ...(cfg.schedules || {}) };
    users.filter(u => ["consultor", "tutor", "academico", "relacionamento"].includes(u.role)).forEach(u => {
      const mine = schedules[String(u.id)];
      if (!mine || !Object.keys(mine).length || OLD_FORM(mine)) schedules[String(u.id)] = PERSON;
    });
    await set("analytics_config", JSON.stringify({ ...cfg, schedules }));
  },
  down: async (queryInterface: QueryInterface) => {
    const q: any = queryInterface.sequelize;
    const Q = (id: string): string => (q.getDialect() === "postgres" ? `"${id}"` : `\`${id}\``);
    const rows: any[] = await q.query(`SELECT value FROM ${Q("Settings")} WHERE ${Q("key")} = 'business_hours_before_20261120'`, { type: QueryTypes.SELECT });
    if (rows.length) await q.query(`UPDATE ${Q("Settings")} SET value = :value WHERE ${Q("key")} = 'business_hours'`, { replacements: { value: rows[0].value } });
  }
};
