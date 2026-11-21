import { QueryInterface, DataTypes } from "sequelize";

// the webhooks of the Meta stored before they are acknowledged (see models/MetaWebhookEvent)
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.createTable("MetaWebhookEvents", {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      key: { type: DataTypes.STRING(80), allowNull: false, unique: true },
      whatsappId: { type: DataTypes.INTEGER, allowNull: true, references: { model: "Whatsapps", key: "id" }, onDelete: "CASCADE", onUpdate: "CASCADE" },
      body: { type: DataTypes.TEXT, allowNull: false },
      status: { type: DataTypes.STRING(16), allowNull: false, defaultValue: "pending" },
      attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      nextAt: { type: DataTypes.DATE, allowNull: true },
      error: { type: DataTypes.TEXT, allowNull: true },
      processedAt: { type: DataTypes.DATE, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false }
    });
    await queryInterface.addIndex("MetaWebhookEvents", ["status", "nextAt"], { name: "meta_webhook_events_status_idx" });
  },
  down: async (queryInterface: QueryInterface) => {
    await queryInterface.dropTable("MetaWebhookEvents");
  }
};
