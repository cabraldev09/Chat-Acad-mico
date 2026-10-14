import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    // when the "lead without an answer" alert was raised (once per lead)
    await queryInterface.addColumn("Leads", "slaAlertedAt", { type: DataTypes.DATE, allowNull: true });
    // per-person preferences (notification sound, ...) kept on the server so they follow the person everywhere
    await queryInterface.addColumn("Users", "preferences", { type: DataTypes.TEXT, allowNull: true });
  },
  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("Leads", "slaAlertedAt");
    await queryInterface.removeColumn("Users", "preferences");
  }
};
