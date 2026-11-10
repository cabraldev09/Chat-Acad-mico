import { QueryInterface, DataTypes } from "sequelize";

// "Ver o que o robô fez" saved in the database: the decisions of the automation survive a restart of the server
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const tables = await queryInterface.showAllTables();
    if (tables.map(String).includes("AutomationTraces")) return;
    await queryInterface.createTable("AutomationTraces", {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      ticketId: { type: DataTypes.INTEGER, allowNull: false },
      text: { type: DataTypes.TEXT, allowNull: false },
      createdAt: { type: DataTypes.DATE, allowNull: false }
    });
    await queryInterface.addIndex("AutomationTraces", ["ticketId", "createdAt"]);
    await queryInterface.addIndex("AutomationTraces", ["createdAt"]);
  },
  down: async (queryInterface: QueryInterface) => {
    await queryInterface.dropTable("AutomationTraces");
  }
};
