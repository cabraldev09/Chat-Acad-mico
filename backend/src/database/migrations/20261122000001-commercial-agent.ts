import { QueryInterface, DataTypes } from "sequelize";

// The commercial AI agent: the commercial state of each lead (slots, temperature, score, next action...), the milestones that
// feed the funnel metrics, one log row per AI turn (tokens, tools, cache, latency), the modality rules of each course (the MEC
// changes) and topics for the knowledge base.
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.createTable("LeadCommercials", {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      leadId: { type: DataTypes.INTEGER, allowNull: false, unique: true, references: { model: "Leads", key: "id" }, onUpdate: "CASCADE", onDelete: "CASCADE" },
      agentId: { type: DataTypes.INTEGER, allowNull: true },
      flowId: { type: DataTypes.INTEGER, allowNull: true },
      // every slot of the lead (see CommercialServices/Slots)
      slots: { type: DataTypes.TEXT, allowNull: false, defaultValue: "{}" },
      temperature: { type: DataTypes.STRING(8), allowNull: false, defaultValue: "cold" },
      commercialScore: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      readyForProposal: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      nextAction: { type: DataTypes.STRING(40), allowNull: true },
      lastIntent: { type: DataTypes.STRING(40), allowNull: true },
      followUpReason: { type: DataTypes.STRING(300), allowNull: true },
      followUpAt: { type: DataTypes.DATE(6), allowNull: true },
      summary: { type: DataTypes.TEXT, allowNull: true },
      stageKey: { type: DataTypes.STRING(40), allowNull: true },
      lastNoteHash: { type: DataTypes.STRING(40), allowNull: true },
      lastInboundAt: { type: DataTypes.DATE(6), allowNull: true },
      lastOutboundAt: { type: DataTypes.DATE(6), allowNull: true },
      createdAt: { type: DataTypes.DATE(6), allowNull: false },
      updatedAt: { type: DataTypes.DATE(6), allowNull: false }
    });
    await queryInterface.addIndex("LeadCommercials", ["temperature"]);
    await queryInterface.addIndex("LeadCommercials", ["readyForProposal"]);

    await queryInterface.createTable("AgentMetricEvents", {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      leadId: { type: DataTypes.INTEGER, allowNull: true },
      agentId: { type: DataTypes.INTEGER, allowNull: true },
      flowId: { type: DataTypes.INTEGER, allowNull: true },
      event: { type: DataTypes.STRING(40), allowNull: false },
      // a milestone counts once per lead (the funnel); the others (an unknown question, a reply without AI) can repeat
      once: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      meta: { type: DataTypes.TEXT, allowNull: true },
      createdAt: { type: DataTypes.DATE(6), allowNull: false },
      updatedAt: { type: DataTypes.DATE(6), allowNull: false }
    });
    await queryInterface.addIndex("AgentMetricEvents", ["agentId", "event", "createdAt"]);
    if (queryInterface.sequelize.getDialect() === "postgres") {
      await queryInterface.sequelize.query(`CREATE UNIQUE INDEX "agent_metric_once" ON "AgentMetricEvents" ("leadId", "event") WHERE "once" = true AND "leadId" IS NOT NULL`);
    }

    await queryInterface.createTable("AgentTurnLogs", {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      agentId: { type: DataTypes.INTEGER, allowNull: true },
      flowId: { type: DataTypes.INTEGER, allowNull: true },
      nodeId: { type: DataTypes.STRING(40), allowNull: true },
      ticketId: { type: DataTypes.INTEGER, allowNull: true },
      leadId: { type: DataTypes.INTEGER, allowNull: true },
      intent: { type: DataTypes.STRING(40), allowNull: true },
      // answered by the system itself, without calling the model
      deterministic: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      llmCalls: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      toolCalls: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      cacheHits: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      inputTokens: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      outputTokens: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      cacheReadTokens: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      latencyMs: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      outcome: { type: DataTypes.STRING(40), allowNull: true },
      model: { type: DataTypes.STRING(60), allowNull: true },
      createdAt: { type: DataTypes.DATE(6), allowNull: false },
      updatedAt: { type: DataTypes.DATE(6), allowNull: false }
    });
    await queryInterface.addIndex("AgentTurnLogs", ["agentId", "createdAt"]);
    await queryInterface.addIndex("AgentTurnLogs", ["ticketId"]);
    await queryInterface.addIndex("AgentTurnLogs", ["leadId"]);
    await queryInterface.addIndex("AgentTurnLogs", ["flowId", "nodeId"]);

    await queryInterface.createTable("CourseRegulations", {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      courseId: { type: DataTypes.INTEGER, allowNull: false, references: { model: "Courses", key: "id" }, onUpdate: "CASCADE", onDelete: "CASCADE" },
      // null = every intake period; a period (2026/2) overrides it
      intakeTerm: { type: DataTypes.STRING(10), allowNull: true },
      mecImpacted: { type: DataTypes.BOOLEAN, allowNull: true },
      regulation: { type: DataTypes.STRING(300), allowNull: true },
      percentualPresencial: { type: DataTypes.DECIMAL(5, 2), allowNull: true },
      percentualSincrono: { type: DataTypes.DECIMAL(5, 2), allowNull: true },
      teoriaAoVivo: { type: DataTypes.BOOLEAN, allowNull: true },
      praticaPresencial: { type: DataTypes.BOOLEAN, allowNull: true },
      cronogramaPraticasDefinido: { type: DataTypes.BOOLEAN, allowNull: true },
      transitionStatus: { type: DataTypes.STRING(40), allowNull: true },
      currentDelivery: { type: DataTypes.STRING(40), allowNull: true },
      futureDelivery: { type: DataTypes.STRING(40), allowNull: true },
      transitionNote: { type: DataTypes.TEXT, allowNull: true },
      commercialApprovedText: { type: DataTypes.TEXT, allowNull: true },
      createdAt: { type: DataTypes.DATE(6), allowNull: false },
      updatedAt: { type: DataTypes.DATE(6), allowNull: false }
    });
    await queryInterface.addIndex("CourseRegulations", ["courseId", "intakeTerm"]);

    // the knowledge base by subject: "institutional/tutoring", "courses/12/overview"
    await queryInterface.addColumn("KbDocuments", "topic", { type: DataTypes.STRING(80), allowNull: true });
    await queryInterface.addColumn("KbDocuments", "courseId", { type: DataTypes.INTEGER, allowNull: true });
    await queryInterface.addIndex("KbDocuments", ["topic"]);

    await queryInterface.addColumn("AiUsage", "latencyMs", { type: DataTypes.INTEGER, allowNull: true });
    await queryInterface.addColumn("AiUsage", "leadId", { type: DataTypes.INTEGER, allowNull: true });
  },
  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("AiUsage", "leadId");
    await queryInterface.removeColumn("AiUsage", "latencyMs");
    await queryInterface.removeColumn("KbDocuments", "courseId");
    await queryInterface.removeColumn("KbDocuments", "topic");
    await queryInterface.dropTable("CourseRegulations");
    await queryInterface.dropTable("AgentTurnLogs");
    await queryInterface.dropTable("AgentMetricEvents");
    await queryInterface.dropTable("LeadCommercials");
  }
};
