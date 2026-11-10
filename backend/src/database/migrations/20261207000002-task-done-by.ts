import { QueryInterface, DataTypes } from "sequelize";

// Who ticked a task: the task stays registered in "Concluídas" with the person and the moment.
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.addColumn("LeadTasks", "doneById", { type: DataTypes.INTEGER, allowNull: true });
    await queryInterface.addIndex("LeadTasks", ["userId", "doneAt"]);
  },
  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("LeadTasks", "doneById");
  }
};
