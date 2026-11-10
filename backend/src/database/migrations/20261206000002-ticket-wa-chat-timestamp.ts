import { QueryInterface, DataTypes } from "sequelize";

// The moment WhatsApp itself gives to each chat (its last activity): the list is ordered like the phone's, not by when each message reached the system.
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.addColumn("Tickets", "waChatTimestamp", { type: DataTypes.DATE(6), allowNull: true });
  },
  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("Tickets", "waChatTimestamp");
  }
};
