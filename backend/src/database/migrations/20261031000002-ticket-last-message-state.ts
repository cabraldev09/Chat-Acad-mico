import { QueryInterface, DataTypes } from "sequelize";

// The conversation list shows the last message with its delivery ticks, like WhatsApp does
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.addColumn("Tickets", "lastMessageId", { type: DataTypes.STRING, allowNull: true });
    await queryInterface.addColumn("Tickets", "lastMessageFromMe", { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false });
    await queryInterface.addColumn("Tickets", "lastMessageAck", { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 });
  },
  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("Tickets", "lastMessageId");
    await queryInterface.removeColumn("Tickets", "lastMessageFromMe");
    await queryInterface.removeColumn("Tickets", "lastMessageAck");
  }
};
