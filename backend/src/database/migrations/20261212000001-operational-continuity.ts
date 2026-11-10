import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (q: QueryInterface) => {
    await q.sequelize.transaction(async transaction => {
      const o = { transaction };
      await q.addColumn("AiUsage", "estimatedUsd", { type: DataTypes.DECIMAL(14, 8), allowNull: true }, o);
      await q.addColumn("Users", "acceptsNewTickets", { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }, o);
      await q.addColumn("Users", "maxOpenTickets", { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 }, o);
      await q.addColumn("LeadTasks", "automationKey", { type: DataTypes.STRING(200), allowNull: true }, o);
      await q.addIndex("LeadTasks", ["automationKey"], { unique: true, name: "lead_tasks_automation_key", ...o });
      await q.addColumn("Tickets", "slaAlertedMessageId", { type: DataTypes.STRING, allowNull: true }, o);
      await q.addColumn("Tickets", "slaEscalatedMessageId", { type: DataTypes.STRING, allowNull: true }, o);
      await q.addIndex("Tickets", ["status", "lastMessageFromMe", "lastMessageAt"], { name: "tickets_waiting_response", ...o });
      await q.createTable("OutboundDeliveries", {
        id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
        key: { type: DataTypes.STRING(200), allowNull: false, unique: true },
        ticketId: { type: DataTypes.INTEGER, allowNull: true, references: { model: "Tickets", key: "id" }, onDelete: "SET NULL" },
        contactId: { type: DataTypes.INTEGER, allowNull: false }, whatsappId: { type: DataTypes.INTEGER, allowNull: false },
        channel: { type: DataTypes.STRING, allowNull: false }, status: { type: DataTypes.STRING, allowNull: false, defaultValue: "sending" },
        externalId: { type: DataTypes.STRING, allowNull: true }, error: { type: DataTypes.TEXT, allowNull: true },
        estimatedUsd: { type: DataTypes.DECIMAL(14, 8), allowNull: true },
        createdAt: { type: DataTypes.DATE, allowNull: false }, updatedAt: { type: DataTypes.DATE, allowNull: false }
      }, o);
      await q.addIndex("OutboundDeliveries", ["createdAt", "status"], { name: "outbound_daily_usage", ...o });
      await q.createTable("AiBudgetReservations", {
        id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true }, agentId: { type: DataTypes.INTEGER, allowNull: false },
        tokens: { type: DataTypes.INTEGER, allowNull: false }, estimatedUsd: { type: DataTypes.DECIMAL(14, 8), allowNull: false },
        expiresAt: { type: DataTypes.DATE, allowNull: false }, createdAt: { type: DataTypes.DATE, allowNull: false }, updatedAt: { type: DataTypes.DATE, allowNull: false }
      }, o);
      await q.addIndex("AiBudgetReservations", ["expiresAt"], { name: "ai_budget_expiry", ...o });
      await q.sequelize.query(`UPDATE "Leads" l SET "nextFollowUpAt" = (SELECT MIN(t."dueAt") FROM "LeadTasks" t WHERE t."leadId" = l.id AND t."doneAt" IS NULL)`, o);
      for (const table of ["OutboundDeliveries", "AiBudgetReservations"]) {
        await q.sequelize.query(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`, o);
      }
    });
  },
  down: async (q: QueryInterface) => {
    await q.removeColumn("AiUsage", "estimatedUsd");
    await q.dropTable("AiBudgetReservations"); await q.dropTable("OutboundDeliveries");
    await q.removeIndex("Tickets", "tickets_waiting_response");
    await q.removeColumn("Tickets", "slaEscalatedMessageId"); await q.removeColumn("Tickets", "slaAlertedMessageId");
    await q.removeIndex("LeadTasks", "lead_tasks_automation_key"); await q.removeColumn("LeadTasks", "automationKey");
    await q.removeColumn("Users", "maxOpenTickets"); await q.removeColumn("Users", "acceptsNewTickets");
  }
};
