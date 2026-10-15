import { QueryInterface, DataTypes } from "sequelize";
module.exports = {
  up: async (q: QueryInterface) => {
    await q.createTable("WebhookDeliveries", {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      webhookId: { type: DataTypes.INTEGER, allowNull: false, references: { model: "Webhooks", key: "id" }, onDelete: "CASCADE" },
      payload: { type: DataTypes.TEXT, allowNull: false },
      status: { type: DataTypes.STRING(16), allowNull: false, defaultValue: "pending" },
      attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      nextAttemptAt: { type: DataTypes.DATE, allowNull: false },
      claimedAt: { type: DataTypes.DATE, allowNull: true },
      lastError: { type: DataTypes.TEXT, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false }
    });
    await q.addIndex("WebhookDeliveries", ["status", "nextAttemptAt"]);
  },
  down: async (q: QueryInterface) => q.dropTable("WebhookDeliveries")
};
