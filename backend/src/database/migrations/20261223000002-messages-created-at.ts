import { QueryInterface } from "sequelize";

// The management panel and the statistics read the messages of a period ("createdAt" between two dates). The only indexes on that
// column were per conversation and a partial one for unconfirmed ticks, so a long period read the whole table. Built CONCURRENTLY
// (no lock on the busiest table while it is built), so this migration runs outside a transaction.
module.exports = {
  up: async (q: QueryInterface) => {
    await q.sequelize.query(`CREATE INDEX CONCURRENTLY IF NOT EXISTS messages_created_at ON "Messages" ("createdAt")`);
  },
  down: async (q: QueryInterface) => {
    await q.sequelize.query(`DROP INDEX CONCURRENTLY IF EXISTS messages_created_at`);
  }
};
