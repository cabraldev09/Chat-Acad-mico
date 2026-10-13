import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    // archived conversations leave the inbox until the contact writes again
    await queryInterface.addColumn("Tickets", "archivedAt", { type: DataTypes.DATE(6), allowNull: true });
    // pins are personal, like on WhatsApp: each person pins what matters to them
    await queryInterface.createTable("TicketPins", {
      userId: { type: DataTypes.INTEGER, primaryKey: true, allowNull: false, references: { model: "Users", key: "id" }, onDelete: "CASCADE" },
      ticketId: { type: DataTypes.INTEGER, primaryKey: true, allowNull: false, references: { model: "Tickets", key: "id" }, onDelete: "CASCADE" },
      createdAt: { type: DataTypes.DATE(6), allowNull: false },
      updatedAt: { type: DataTypes.DATE(6), allowNull: false }
    });
  },
  down: async (queryInterface: QueryInterface) => {
    await queryInterface.dropTable("TicketPins");
    await queryInterface.removeColumn("Tickets", "archivedAt");
  }
};
