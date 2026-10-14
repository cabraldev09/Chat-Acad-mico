import { QueryInterface } from "sequelize";

// Groups are not "accepted": on a personal number they belong to whoever connected it, open from the start.
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.sequelize.query(`
      UPDATE "Tickets" t
      SET "status" = 'open', "userId" = w."ownerId"
      FROM "Whatsapps" w
      WHERE t."whatsappId" = w."id" AND t."isGroup" = true AND t."status" = 'pending'
        AND t."userId" IS NULL AND t."isHistorical" = false AND w."ownerId" IS NOT NULL
    `);
  },
  down: async () => undefined
};
