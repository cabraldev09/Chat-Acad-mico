import { QueryInterface, DataTypes } from "sequelize";

// "Pronto para o consultor" as a column (the CRM board filters and sorts by it) and the reason a lead left the AI agent in lost.
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.addColumn("LeadCommercials", "readyForConsultant", { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false });
    await queryInterface.addIndex("LeadCommercials", ["readyForConsultant"]);
  },
  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("LeadCommercials", "readyForConsultant");
  }
};
