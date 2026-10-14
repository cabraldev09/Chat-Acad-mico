import { QueryInterface, DataTypes } from "sequelize";

// Central do Afiliado: materials are grouped in collections (graduacao | pos | tecnico | programa) and count how many
// times the affiliate copied the ready message (downloads were already counted).
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.addColumn("AffiliateMaterials", "collection", { type: DataTypes.STRING, allowNull: true });
    await queryInterface.addColumn("AffiliateMaterials", "copies", { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 });
    // the materials that already exist keep working: those about a course go to the graduation collection
    await queryInterface.sequelize.query(
      `UPDATE "AffiliateMaterials" SET "collection" = 'graduacao' WHERE "collection" IS NULL AND ("courseId" IS NOT NULL OR "kind" IN ('course_info', 'course_list'))`
    );
  },
  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("AffiliateMaterials", "copies");
    await queryInterface.removeColumn("AffiliateMaterials", "collection");
  }
};
