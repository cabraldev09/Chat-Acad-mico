import { QueryInterface, DataTypes } from "sequelize";

// Conversations that were already there when a number was connected are history: they stay readable but
// never count in the dashboards, the CRM funnel or the conversation lists.
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.addColumn("Tickets", "isHistorical", {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    });
    await queryInterface.addColumn("Leads", "isHistorical", {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    });
  },
  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("Tickets", "isHistorical");
    await queryInterface.removeColumn("Leads", "isHistorical");
  }
};
