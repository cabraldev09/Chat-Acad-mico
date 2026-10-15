import { QueryInterface, DataTypes } from "sequelize";

// "Funções de IA": what the agent may start on its own (a flow), with a name and when to use it.
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.addColumn("AiAgents", "functions", { type: DataTypes.JSON, allowNull: true });
  },
  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("AiAgents", "functions");
  }
};
