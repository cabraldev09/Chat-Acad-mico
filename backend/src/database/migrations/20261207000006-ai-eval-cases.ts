import { QueryInterface, DataTypes } from "sequelize";

// Conversations the owner expects the agent to handle well: saved from the tester and run again after every change.
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const tables = (await queryInterface.showAllTables()).map((t: any) => String(t.tableName || t));
    if (tables.includes("AiEvalCases")) return;
    await queryInterface.createTable("AiEvalCases", {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      agentId: { type: DataTypes.INTEGER, allowNull: false, references: { model: "AiAgents", key: "id" }, onDelete: "CASCADE" },
      name: { type: DataTypes.STRING(160), allowNull: false },
      messages: { type: DataTypes.TEXT, allowNull: false },
      expect: { type: DataTypes.TEXT, allowNull: false },
      lastStatus: { type: DataTypes.STRING(10), allowNull: true },
      lastText: { type: DataTypes.TEXT, allowNull: true },
      lastReasons: { type: DataTypes.TEXT, allowNull: true },
      lastRunAt: { type: DataTypes.DATE, allowNull: true },
      createdBy: { type: DataTypes.INTEGER, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false }
    });
    await queryInterface.addIndex("AiEvalCases", ["agentId"], { name: "ai_eval_cases_agent_idx" });
  },
  down: async (queryInterface: QueryInterface) => {
    await queryInterface.dropTable("AiEvalCases");
  }
};
