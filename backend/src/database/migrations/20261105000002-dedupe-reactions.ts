import { QueryInterface } from "sequelize";

// A reaction sent from here came back from WhatsApp with another sender id and was stored twice ("🙏 2").
// Keep one reaction per person: mine (fromMe) collapse into one.
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const [rows] = (await queryInterface.sequelize.query(
      `SELECT "id", "reactions" FROM "Messages" WHERE "reactions" IS NOT NULL AND "reactions" <> ''`
    )) as any;
    for (const row of rows) {
      let list: any[] = [];
      try { list = JSON.parse(row.reactions); } catch (e) { continue; }
      if (!Array.isArray(list)) continue;
      const seen = new Set<string>();
      const clean = list
        .slice()
        .reverse() // the latest wins
        .filter(r => {
          const key = r.fromMe ? "me" : String(r.sender || "");
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .reverse()
        .map(r => (r.fromMe ? { ...r, sender: "me" } : r));
      if (clean.length !== list.length) {
        // eslint-disable-next-line no-await-in-loop
        await queryInterface.sequelize.query(`UPDATE "Messages" SET "reactions" = :value WHERE "id" = :id`, { replacements: { value: JSON.stringify(clean), id: row.id } });
      }
    }
  },
  down: async () => undefined
};
