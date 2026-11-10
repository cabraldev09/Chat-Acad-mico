import { QueryInterface, DataTypes } from "sequelize";

// The AI agent in blocks: a flow can be an agent (`kind = "agent"`, tied to the AI agent that holds the persona, the model, the
// knowledge and the limits), every publication is kept as a version that can be restored, and the AI usage knows the flow and
// the block that spent it.
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.addColumn("ChatFlows", "kind", { type: DataTypes.STRING(10), allowNull: false, defaultValue: "flow" });
    await queryInterface.addColumn("ChatFlows", "agentId", { type: DataTypes.INTEGER, allowNull: true });
    await queryInterface.createTable("ChatFlowVersions", {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      flowId: { type: DataTypes.INTEGER, allowNull: false, references: { model: "ChatFlows", key: "id" }, onUpdate: "CASCADE", onDelete: "CASCADE" },
      version: { type: DataTypes.INTEGER, allowNull: false },
      graph: { type: DataTypes.TEXT, allowNull: false },
      note: { type: DataTypes.STRING(200), allowNull: true },
      publishedBy: { type: DataTypes.INTEGER, allowNull: true },
      createdAt: { type: DataTypes.DATE(6), allowNull: false },
      updatedAt: { type: DataTypes.DATE(6), allowNull: false }
    });
    await queryInterface.addIndex("ChatFlowVersions", ["flowId", "version"]);
    // what is published today becomes the first entry of the history
    await queryInterface.sequelize.query(
      `INSERT INTO "ChatFlowVersions" ("flowId", version, graph, note, "createdAt", "updatedAt")
       SELECT id, GREATEST(version, 1), published, 'Versão que já estava publicada', now(), now() FROM "ChatFlows" WHERE published IS NOT NULL AND status = 'published'`
    );
    await queryInterface.addColumn("AiUsage", "flowId", { type: DataTypes.INTEGER, allowNull: true });
    await queryInterface.addColumn("AiUsage", "nodeId", { type: DataTypes.STRING(40), allowNull: true });
  },
  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("AiUsage", "nodeId");
    await queryInterface.removeColumn("AiUsage", "flowId");
    await queryInterface.dropTable("ChatFlowVersions");
    await queryInterface.removeColumn("ChatFlows", "agentId");
    await queryInterface.removeColumn("ChatFlows", "kind");
  }
};
