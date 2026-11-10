import { QueryInterface, DataTypes } from "sequelize";

// The handoff of the AI agent to the commercial team of the polo: when it happened, why, and how many times the team was warned that
// nobody answered (see CommercialServices/Router and workers/HandoffSla).
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.addColumn("Tickets", "handoffAt", { type: DataTypes.DATE(6), allowNull: true });
    await queryInterface.addColumn("Tickets", "handoffReason", { type: DataTypes.STRING(20), allowNull: true });
    await queryInterface.addColumn("Tickets", "handoffAlerts", { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 });
    await queryInterface.addColumn("Tickets", "handoffAlertedAt", { type: DataTypes.DATE(6), allowNull: true });
    await queryInterface.addIndex("Tickets", ["handoffAt"]);
  },
  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("Tickets", "handoffAlertedAt");
    await queryInterface.removeColumn("Tickets", "handoffAlerts");
    await queryInterface.removeColumn("Tickets", "handoffReason");
    await queryInterface.removeColumn("Tickets", "handoffAt");
  }
};
