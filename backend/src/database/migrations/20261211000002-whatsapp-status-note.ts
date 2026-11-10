import { QueryInterface, DataTypes } from "sequelize";

// Why a connection fell or is still opening, in words for the screen of Conexões
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const columns = await queryInterface.describeTable("Whatsapps");
    if (!("statusNote" in columns)) await queryInterface.addColumn("Whatsapps", "statusNote", { type: DataTypes.TEXT, allowNull: true });
  },
  down: async (queryInterface: QueryInterface) => {
    const columns = await queryInterface.describeTable("Whatsapps");
    if ("statusNote" in columns) await queryInterface.removeColumn("Whatsapps", "statusNote");
  }
};
