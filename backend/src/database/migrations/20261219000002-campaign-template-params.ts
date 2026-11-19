import { QueryInterface, DataTypes } from "sequelize";

// An approved template of the official API with more than one variable: which value goes in each {{n}} (first name, course, polo...),
// and the template's text, so the conversation shows what the person really received.
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.addColumn("Campaigns", "templateParams", { type: DataTypes.TEXT, allowNull: true });
    await queryInterface.addColumn("Campaigns", "templateBody", { type: DataTypes.TEXT, allowNull: true });
  },
  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("Campaigns", "templateBody");
    await queryInterface.removeColumn("Campaigns", "templateParams");
  }
};
