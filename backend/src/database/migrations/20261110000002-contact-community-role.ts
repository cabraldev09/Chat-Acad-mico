import { QueryInterface, DataTypes } from "sequelize";

// WhatsApp Communities like WhatsApp Web shows them: the community itself ("parent"), its announcements group
// ("announcement") and the groups inside ("member"). communityId is the WhatsApp id of the community they belong to.
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.addColumn("Contacts", "communityRole", { type: DataTypes.STRING(20), allowNull: true });
    await queryInterface.addColumn("Contacts", "communityId", { type: DataTypes.STRING, allowNull: true });
    await queryInterface.sequelize.query(`CREATE INDEX IF NOT EXISTS "contacts_community_id_idx" ON "Contacts" ("communityId") WHERE "communityId" IS NOT NULL`);
    // what was marked before keeps working: a sub-group already points to its community
    await queryInterface.sequelize.query(`UPDATE "Contacts" SET "communityId" = "parentGroupId", "communityRole" = 'member' WHERE "parentGroupId" IS NOT NULL AND "kind" = 'group'`);
    await queryInterface.sequelize.query(`UPDATE "Contacts" SET "communityId" = "parentGroupId", "communityRole" = 'announcement' WHERE "parentGroupId" IS NOT NULL AND "kind" = 'community'`);
  },
  down: async (queryInterface: QueryInterface) => {
    await queryInterface.sequelize.query(`DROP INDEX IF EXISTS "contacts_community_id_idx"`);
    await queryInterface.removeColumn("Contacts", "communityId");
    await queryInterface.removeColumn("Contacts", "communityRole");
  }
};
