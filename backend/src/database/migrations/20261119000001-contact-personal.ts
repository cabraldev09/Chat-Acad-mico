import { QueryInterface, DataTypes } from "sequelize";

// Contacts.isPersonal: friends and family who write to the system. Like the team (isStaff), they never count in the statistics
// or the CRM funnel; the conversation itself stays as it is.
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.addColumn("Contacts", "isPersonal", { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false });
    await queryInterface.sequelize.query(`CREATE INDEX IF NOT EXISTS "contacts_is_personal_idx" ON "Contacts" ("isPersonal") WHERE "isPersonal" = true`);
  },
  down: async (queryInterface: QueryInterface) => {
    await queryInterface.sequelize.query(`DROP INDEX IF EXISTS "contacts_is_personal_idx"`);
    await queryInterface.removeColumn("Contacts", "isPersonal");
  }
};
