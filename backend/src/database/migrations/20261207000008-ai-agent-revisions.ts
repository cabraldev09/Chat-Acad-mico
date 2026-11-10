import { QueryInterface, DataTypes } from "sequelize";

// What was changed in an agent and by whom, with the whole setting as it stood after the change, so a bad edit can be undone.
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const tables = (await queryInterface.showAllTables()).map((t: any) => String(t.tableName || t));
    if (tables.includes("AiAgentRevisions")) return;
    await queryInterface.createTable("AiAgentRevisions", {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      agentId: { type: DataTypes.INTEGER, allowNull: false, references: { model: "AiAgents", key: "id" }, onDelete: "CASCADE" },
      userId: { type: DataTypes.INTEGER, allowNull: true },
      note: { type: DataTypes.STRING(240), allowNull: true },
      fields: { type: DataTypes.TEXT, allowNull: false },
      snapshot: { type: DataTypes.TEXT, allowNull: false },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false }
    });
    await queryInterface.addIndex("AiAgentRevisions", ["agentId", "createdAt"], { name: "ai_agent_revisions_agent_idx" });
  },
  down: async (queryInterface: QueryInterface) => {
    await queryInterface.dropTable("AiAgentRevisions");
  }
};
