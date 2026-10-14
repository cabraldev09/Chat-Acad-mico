import { QueryInterface, DataTypes } from "sequelize";

// The affiliate receives the value of the student's first monthly fee, paid up to N days (default 60) after the
// enrollment is confirmed: the bonus keeps the date it is due. Users get a contact WhatsApp, which is the support
// number the affiliate sees (the person who registered the affiliate). Older proposals take the affiliate of their lead.
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.addColumn("AffiliateBonuses", "dueAt", { type: DataTypes.DATEONLY, allowNull: true });
    await queryInterface.addColumn("Users", "phone", { type: DataTypes.STRING, allowNull: true });
    await queryInterface.sequelize.query(`
      UPDATE "Proposals" p SET "affiliateId" = l."affiliateId"
      FROM "Leads" l
      WHERE p."leadId" = l."id" AND p."affiliateId" IS NULL AND l."affiliateId" IS NOT NULL
    `);
  },
  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("Users", "phone");
    await queryInterface.removeColumn("AffiliateBonuses", "dueAt");
  }
};
