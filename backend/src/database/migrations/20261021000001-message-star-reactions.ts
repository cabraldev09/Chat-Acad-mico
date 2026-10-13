import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.addColumn("Messages", "starred", {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    });
    // JSON array: [{ emoji, fromMe, sender }]
    await queryInterface.addColumn("Messages", "reactions", { type: DataTypes.TEXT, allowNull: true });
  },
  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("Messages", "reactions");
    await queryInterface.removeColumn("Messages", "starred");
  }
};
