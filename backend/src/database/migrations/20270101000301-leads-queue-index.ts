import { QueryInterface } from "sequelize";

// The common queue (helpers/LeadQueue): the leads nobody owns yet, listed newest first to every consultant. A partial index holds only those
// rows (a few at a time), so the list stays fast however many leads the table has. Nothing else changes.
module.exports = {
  up: async (q: QueryInterface) => {
    await q.sequelize.query(
      `CREATE INDEX IF NOT EXISTS leads_queue_idx ON "Leads" ("updatedAt" DESC) WHERE "ownerId" IS NULL AND "enrolledAt" IS NULL AND "wonAt" IS NULL AND "lostAt" IS NULL AND "isHistorical" = false AND "onboardingStatus" = 'none'`
    );
  },
  down: async (q: QueryInterface) => {
    await q.sequelize.query(`DROP INDEX IF EXISTS leads_queue_idx`);
  }
};
