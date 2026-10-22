import { QueryInterface, DataTypes } from "sequelize";

// The send of a person's message is first written here (together with the assignment of the conversation) and made by a worker.
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.createTable("OutboundMessages", {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      ticketId: { type: DataTypes.INTEGER, allowNull: false, references: { model: "Tickets", key: "id" }, onUpdate: "CASCADE", onDelete: "CASCADE" },
      userId: { type: DataTypes.INTEGER, allowNull: false, references: { model: "Users", key: "id" }, onUpdate: "CASCADE", onDelete: "CASCADE" },
      clientKey: { type: DataTypes.STRING, allowNull: false },
      payload: { type: DataTypes.JSON, allowNull: false },
      status: { type: DataTypes.STRING, allowNull: false, defaultValue: "pending" },
      attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      nextAttemptAt: { type: DataTypes.DATE, allowNull: true },
      lockedAt: { type: DataTypes.DATE, allowNull: true },
      providerMsgId: { type: DataTypes.STRING, allowNull: true },
      error: { type: DataTypes.TEXT, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false }
    });
    await queryInterface.addIndex("OutboundMessages", ["ticketId", "clientKey"], { unique: true, name: "outbound_messages_ticket_client_key" });
    await queryInterface.addIndex("OutboundMessages", ["status", "nextAttemptAt"], { name: "outbound_messages_status_next" });
  },
  down: async (queryInterface: QueryInterface) => {
    await queryInterface.dropTable("OutboundMessages");
  }
};
