import { QueryInterface, DataTypes } from "sequelize";

// Visual chatbot flows (graph of blocks), the run of each conversation through a flow, per-block counters and the
// triggers ("Gatilhos") that start a flow when something happens in the system.
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const stamps = {
      createdAt: { type: DataTypes.DATE(6), allowNull: false },
      updatedAt: { type: DataTypes.DATE(6), allowNull: false }
    };
    await queryInterface.createTable("ChatFlows", {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      name: { type: DataTypes.STRING, allowNull: false },
      description: { type: DataTypes.STRING, allowNull: true },
      whatsappId: { type: DataTypes.INTEGER, allowNull: true }, // null = every connection
      status: { type: DataTypes.STRING, allowNull: false, defaultValue: "draft" }, // draft | published
      entry: { type: DataTypes.TEXT, allowNull: false, defaultValue: '{"type":"first_message"}' },
      draft: { type: DataTypes.TEXT, allowNull: false, defaultValue: '{"nodes":[],"edges":[]}' },
      published: { type: DataTypes.TEXT, allowNull: true },
      version: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      publishedAt: { type: DataTypes.DATE(6), allowNull: true },
      createdBy: { type: DataTypes.INTEGER, allowNull: true },
      ...stamps
    });
    await queryInterface.createTable("ChatFlowRuns", {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      flowId: { type: DataTypes.INTEGER, allowNull: false, references: { model: "ChatFlows", key: "id" }, onDelete: "CASCADE" },
      ticketId: { type: DataTypes.INTEGER, allowNull: true, references: { model: "Tickets", key: "id" }, onDelete: "CASCADE" },
      contactId: { type: DataTypes.INTEGER, allowNull: true },
      version: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
      nodeId: { type: DataTypes.STRING, allowNull: true }, // the block that waits for the answer
      status: { type: DataTypes.STRING, allowNull: false, defaultValue: "waiting" }, // waiting | delayed | done | handoff
      vars: { type: DataTypes.TEXT, allowNull: false, defaultValue: "{}" },
      tries: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      resumeAt: { type: DataTypes.DATE(6), allowNull: true },
      ...stamps
    });
    await queryInterface.sequelize.query(`CREATE INDEX IF NOT EXISTS "chatflowruns_ticket_idx" ON "ChatFlowRuns" ("ticketId", "status")`);
    await queryInterface.sequelize.query(`CREATE INDEX IF NOT EXISTS "chatflowruns_resume_idx" ON "ChatFlowRuns" ("status", "resumeAt")`);
    await queryInterface.createTable("ChatFlowStats", {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      flowId: { type: DataTypes.INTEGER, allowNull: false, references: { model: "ChatFlows", key: "id" }, onDelete: "CASCADE" },
      nodeId: { type: DataTypes.STRING, allowNull: false }, // a block id, or __start / __done / __crm / __handoff
      entered: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      ...stamps
    });
    await queryInterface.sequelize.query(`CREATE UNIQUE INDEX IF NOT EXISTS "chatflowstats_unique" ON "ChatFlowStats" ("flowId", "nodeId")`);
    await queryInterface.createTable("AutomationTriggers", {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      name: { type: DataTypes.STRING, allowNull: false },
      active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      event: { type: DataTypes.STRING, allowNull: false },
      config: { type: DataTypes.TEXT, allowNull: false, defaultValue: "{}" },
      flowId: { type: DataTypes.INTEGER, allowNull: true, references: { model: "ChatFlows", key: "id" }, onDelete: "SET NULL" },
      runCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      lastRunAt: { type: DataTypes.DATE(6), allowNull: true },
      createdBy: { type: DataTypes.INTEGER, allowNull: true },
      ...stamps
    });
    await queryInterface.sequelize.query(`CREATE INDEX IF NOT EXISTS "automationtriggers_event_idx" ON "AutomationTriggers" ("event", "active")`);
  },
  down: async (queryInterface: QueryInterface) => {
    await queryInterface.dropTable("AutomationTriggers");
    await queryInterface.dropTable("ChatFlowStats");
    await queryInterface.dropTable("ChatFlowRuns");
    await queryInterface.dropTable("ChatFlows");
  }
};
