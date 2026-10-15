import { QueryInterface, DataTypes } from "sequelize";

// Since when a connection is in its current state: "caiu há 12 minutos", and the alert only after a few minutes.
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.addColumn("Whatsapps", "statusSince", { type: DataTypes.DATE(6), allowNull: true });
    await queryInterface.sequelize.query(`UPDATE "Whatsapps" SET "statusSince" = "updatedAt" WHERE "statusSince" IS NULL`);
  },
  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("Whatsapps", "statusSince");
  }
};
