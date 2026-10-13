import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const pg = queryInterface.sequelize.getDialect() === "postgres";

    // knowledge base: documents are split into small chunks so only the relevant ones reach the model
    await queryInterface.createTable("KbDocuments", {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      title: { type: DataTypes.STRING, allowNull: false },
      // doc: free text · faq: question + answer sent without calling the model
      kind: { type: DataTypes.STRING, allowNull: false, defaultValue: "doc" },
      source: { type: DataTypes.STRING, allowNull: false, defaultValue: "texto" },
      keywords: { type: DataTypes.TEXT, allowNull: true },
      content: { type: DataTypes.TEXT({ length: "long" }), allowNull: false },
      // null = shared by every agent
      agentId: { type: DataTypes.INTEGER, allowNull: true, references: { model: "AiAgents", key: "id" }, onDelete: "CASCADE" },
      createdAt: { type: DataTypes.DATE(6), allowNull: false },
      updatedAt: { type: DataTypes.DATE(6), allowNull: false }
    });
    await queryInterface.createTable("KbChunks", {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      documentId: { type: DataTypes.INTEGER, allowNull: false, references: { model: "KbDocuments", key: "id" }, onDelete: "CASCADE" },
      position: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      content: { type: DataTypes.TEXT, allowNull: false },
      // same text without accents or capitals: what the full-text index reads
      contentNorm: { type: DataTypes.TEXT, allowNull: false },
      createdAt: { type: DataTypes.DATE(6), allowNull: false },
      updatedAt: { type: DataTypes.DATE(6), allowNull: false }
    });
    if (pg) {
      await queryInterface.sequelize.query(
        `ALTER TABLE "KbChunks" ADD COLUMN tsv tsvector GENERATED ALWAYS AS (to_tsvector('portuguese', "contentNorm")) STORED`
      );
      await queryInterface.sequelize.query(`CREATE INDEX "kb_chunks_tsv_idx" ON "KbChunks" USING GIN (tsv)`);
    }
    await queryInterface.addIndex("KbChunks", ["documentId"]);

    // what each model call cost in tokens (the price is optional, see Settings ai_price_*)
    await queryInterface.createTable("AiUsage", {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      agentId: { type: DataTypes.INTEGER, allowNull: true },
      ticketId: { type: DataTypes.INTEGER, allowNull: true },
      model: { type: DataTypes.STRING, allowNull: false },
      kind: { type: DataTypes.STRING, allowNull: false, defaultValue: "reply" },
      inputTokens: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      outputTokens: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      cacheReadTokens: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      cacheWriteTokens: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      createdAt: { type: DataTypes.DATE(6), allowNull: false },
      updatedAt: { type: DataTypes.DATE(6), allowNull: false }
    });
    await queryInterface.addIndex("AiUsage", ["agentId", "createdAt"]);

    await queryInterface.addColumn("AiAgents", "persona", { type: DataTypes.JSON, allowNull: true });
    await queryInterface.addColumn("AiAgents", "maxTokens", { type: DataTypes.INTEGER, allowNull: false, defaultValue: 350 });
    await queryInterface.addColumn("AiAgents", "dailyTokenCap", { type: DataTypes.INTEGER, allowNull: false, defaultValue: 300000 });
    await queryInterface.addColumn("AiAgents", "handoffAfterTurns", { type: DataTypes.INTEGER, allowNull: false, defaultValue: 14 });
    await queryInterface.addColumn("AiAgents", "waitSeconds", { type: DataTypes.INTEGER, allowNull: false, defaultValue: 4 });
    await queryInterface.addColumn("AiAgents", "slots", { type: DataTypes.JSON, allowNull: true });

    await queryInterface.addColumn("Tickets", "aiSummary", { type: DataTypes.TEXT, allowNull: true });
    await queryInterface.addColumn("Tickets", "aiTurns", { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 });
    await queryInterface.addColumn("Tickets", "aiSlots", { type: DataTypes.JSON, allowNull: true });
    await queryInterface.addColumn("Tickets", "botReminderAt", { type: DataTypes.DATE(6), allowNull: true });

    // chatbot nodes that collect an answer or call out: the field/URL they use
    await queryInterface.addColumn("ChatbotNodes", "field", { type: DataTypes.STRING, allowNull: true });
  },
  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("ChatbotNodes", "field");
    for (const c of ["botReminderAt", "aiSlots", "aiTurns", "aiSummary"]) await queryInterface.removeColumn("Tickets", c);
    for (const c of ["slots", "waitSeconds", "handoffAfterTurns", "dailyTokenCap", "maxTokens", "persona"]) {
      await queryInterface.removeColumn("AiAgents", c);
    }
    await queryInterface.dropTable("AiUsage");
    await queryInterface.dropTable("KbChunks");
    await queryInterface.dropTable("KbDocuments");
  }
};
