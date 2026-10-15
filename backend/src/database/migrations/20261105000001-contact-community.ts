import { QueryInterface, DataTypes } from "sequelize";

// WhatsApp Communities: the announcement group / the community itself gets kind = "community" and its sub-groups keep
// their link in parentGroupId. readOnly: only administrators can write there and this number is not one of them.
// Communities are not customers: they stay out of statistics, the CRM and "no answer", exactly like groups.
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.addColumn("Contacts", "parentGroupId", { type: DataTypes.STRING, allowNull: true });
    await queryInterface.addColumn("Contacts", "readOnly", { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false });
    await queryInterface.sequelize.query(`CREATE INDEX IF NOT EXISTS "contacts_parent_group_idx" ON "Contacts" ("parentGroupId") WHERE "parentGroupId" IS NOT NULL`);
  },
  down: async (queryInterface: QueryInterface) => {
    await queryInterface.sequelize.query(`DROP INDEX IF EXISTS "contacts_parent_group_idx"`);
    await queryInterface.removeColumn("Contacts", "readOnly");
    await queryInterface.removeColumn("Contacts", "parentGroupId");
  }
};
