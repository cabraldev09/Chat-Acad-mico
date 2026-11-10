import { QueryInterface, DataTypes } from "sequelize";

// Chats pinned at the top of the phone's WhatsApp: the list shows them in the same place. (A person's own pins in the
// system are a separate thing, TicketPins.)
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.addColumn("Tickets", "waPinned", { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false });
  },
  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("Tickets", "waPinned");
  }
};
