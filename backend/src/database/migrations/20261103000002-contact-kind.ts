import { QueryInterface, DataTypes } from "sequelize";

// kind: person | group | channel (WhatsApp Channels / newsletters, announcements) | business
// Channels are not customers: they never appear in lists, the dashboard, statistics or the CRM.
// noReply: "this one does not need an answer" (broadcasts, notices): out of the "no answer" list.
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.addColumn("Contacts", "kind", { type: DataTypes.STRING, allowNull: false, defaultValue: "person" });
    await queryInterface.addColumn("Contacts", "noReply", { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false });
    await queryInterface.sequelize.query(`UPDATE "Contacts" SET "kind" = 'group' WHERE "isGroup" = true`);
    // channel and group ids are 18 digits starting with 1203; a person's phone has at most 15
    await queryInterface.sequelize.query(
      `UPDATE "Contacts" SET "kind" = 'channel' WHERE "isGroup" = false AND "number" ~ '^1203[0-9]{12,}$'`
    );
    await queryInterface.sequelize.query(`
      UPDATE "Leads" SET "isHistorical" = true
      WHERE "contactId" IN (SELECT "id" FROM "Contacts" WHERE "kind" = 'channel')
    `);
    await queryInterface.sequelize.query(`CREATE INDEX IF NOT EXISTS "contacts_kind_idx" ON "Contacts" ("kind") WHERE "kind" <> 'person'`);
  },
  down: async (queryInterface: QueryInterface) => {
    await queryInterface.sequelize.query(`DROP INDEX IF EXISTS "contacts_kind_idx"`);
    await queryInterface.removeColumn("Contacts", "noReply");
    await queryInterface.removeColumn("Contacts", "kind");
  }
};
