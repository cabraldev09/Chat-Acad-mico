import { QueryInterface } from "sequelize";

// The lists of the coordination are judged by their people (helpers/ListScope): each number is matched to a contact or a lead by DDD + the last
// 8 digits (the same mobile number with and without the ninth digit). Indexes on that expression keep the check an index lookup.
const KEY = (col: string) => `(CASE WHEN ${col} LIKE '55%' AND length(${col}) IN (12,13) THEN substr(${col}, 3, 2) || right(${col}, 8) ELSE ${col} END)`;
module.exports = {
  up: async (q: QueryInterface) => {
    await q.sequelize.query(`CREATE INDEX IF NOT EXISTS contacts_phone_key_idx ON "Contacts" (${KEY('"number"')})`);
    await q.sequelize.query(`CREATE INDEX IF NOT EXISTS leads_phone_key_idx ON "Leads" (${KEY('"phone"')})`);
  },
  down: async (q: QueryInterface) => {
    await q.sequelize.query(`DROP INDEX IF EXISTS contacts_phone_key_idx`);
    await q.sequelize.query(`DROP INDEX IF EXISTS leads_phone_key_idx`);
  }
};
