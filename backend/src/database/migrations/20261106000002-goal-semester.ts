import { QueryInterface, DataTypes } from "sequelize";

// Polo goals are set for a semester and distributed by month. "kind" separates them from the monthly team goals.
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.addColumn("Goals", "kind", { type: DataTypes.STRING, allowNull: false, defaultValue: "team" }); // team | polo
    await queryInterface.addColumn("GoalPolos", "monthly", { type: DataTypes.TEXT, allowNull: true }); // JSON array: target of each month of the period
    await queryInterface.addColumn("GoalPolos", "manualMonthly", { type: DataTypes.TEXT, allowNull: true }); // JSON object {"2026-10": n}: adjustments of a month
  },
  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("GoalPolos", "manualMonthly");
    await queryInterface.removeColumn("GoalPolos", "monthly");
    await queryInterface.removeColumn("Goals", "kind");
  }
};
