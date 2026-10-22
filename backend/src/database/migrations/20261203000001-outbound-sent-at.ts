import { QueryInterface, DataTypes } from "sequelize";

// When a person's message really left (the analytics count what was sent, by who and when, from this table).
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.addColumn("OutboundMessages", "sentAt", { type: DataTypes.DATE, allowNull: true });
    await queryInterface.sequelize.query(`UPDATE "OutboundMessages" SET "sentAt" = "updatedAt" WHERE status = 'sent' AND "sentAt" IS NULL`);
    await queryInterface.addIndex("OutboundMessages", ["userId", "sentAt"], { name: "outbound_messages_user_sent" });
  },
  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeIndex("OutboundMessages", "outbound_messages_user_sent");
    await queryInterface.removeColumn("OutboundMessages", "sentAt");
  }
};
