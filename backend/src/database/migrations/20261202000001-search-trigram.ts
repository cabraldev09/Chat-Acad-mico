import { QueryInterface } from "sequelize";
import { logger } from "../../utils/logger";

// Search by part of a name, e-mail or number ("iLike '%maria%'") read the whole table; the trigram indexes answer it. Best effort: a database that does not
// allow the extension, or an index that cannot be built now, only logs; the system never fails to start because of a search index.
const INDEXES: Array<[string, string, string]> = [
  ["leads_name_trgm", "Leads", `"name"`],
  ["leads_email_trgm", "Leads", `"email"`],
  ["contacts_name_trgm", "Contacts", `"name"`]
];

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const sequelize = queryInterface.sequelize;
    if (sequelize.getDialect() !== "postgres") return;
    try {
      await sequelize.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
    } catch (err) {
      logger.warn(`pg_trgm not available, the search indexes were skipped: ${(err as Error).message}`);
      return;
    }
    for (const [name, table, column] of INDEXES) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await sequelize.query(`CREATE INDEX IF NOT EXISTS "${name}" ON "${table}" USING gin (${column} gin_trgm_ops)`);
      } catch (err) {
        logger.warn(`Search index ${name} was not created: ${(err as Error).message}`);
      }
    }
  },
  down: async (queryInterface: QueryInterface) => {
    const sequelize = queryInterface.sequelize;
    if (sequelize.getDialect() !== "postgres") return;
    for (const [name] of INDEXES) await sequelize.query(`DROP INDEX IF EXISTS "${name}"`);
  }
};
