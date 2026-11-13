import { QueryInterface, DataTypes } from "sequelize";

// Who attended a conversation before it was closed: a client who writes again goes back to that consultant (the "carteira").
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.addColumn("Tickets", "lastUserId", { type: DataTypes.INTEGER, allowNull: true });
  },
  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("Tickets", "lastUserId");
  }
};
