import { QueryInterface } from "sequelize";

// Every message a person sends looks up whether they got a recovery campaign in the last 7 days (by their number): an index on the
// number and the day it went out keeps that a quick lookup.
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    if (queryInterface.sequelize.getDialect() !== "postgres") return;
    await queryInterface.sequelize.query(`CREATE INDEX IF NOT EXISTS "campaign_shippings_number_sent" ON "CampaignShippings" ("number", "sentAt")`);
  },
  down: async (queryInterface: QueryInterface) => {
    if (queryInterface.sequelize.getDialect() !== "postgres") return;
    await queryInterface.sequelize.query(`DROP INDEX IF EXISTS "campaign_shippings_number_sent"`);
  }
};
