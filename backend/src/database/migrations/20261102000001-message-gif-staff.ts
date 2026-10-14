import { QueryInterface, DataTypes } from "sequelize";

// isGif: animated GIFs arrive as video and should loop silently like on WhatsApp.
// Contacts.isStaff: people of the team (even without a login) never count in statistics or the CRM funnel.
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.addColumn("Messages", "isGif", { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false });
    await queryInterface.addColumn("Contacts", "isStaff", { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false });
    await queryInterface.sequelize.query(`CREATE INDEX IF NOT EXISTS "contacts_is_staff_idx" ON "Contacts" ("isStaff") WHERE "isStaff" = true`);
  },
  down: async (queryInterface: QueryInterface) => {
    await queryInterface.sequelize.query(`DROP INDEX IF EXISTS "contacts_is_staff_idx"`);
    await queryInterface.removeColumn("Contacts", "isStaff");
    await queryInterface.removeColumn("Messages", "isGif");
  }
};
