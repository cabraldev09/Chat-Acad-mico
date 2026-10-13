import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.createTable("TicketEvents", {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      ticketId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "Tickets", key: "id" },
        onDelete: "CASCADE"
      },
      type: { type: DataTypes.STRING, allowNull: false },
      actorId: { type: DataTypes.INTEGER, allowNull: true },
      fromQueueId: { type: DataTypes.INTEGER, allowNull: true },
      toQueueId: { type: DataTypes.INTEGER, allowNull: true },
      fromUserId: { type: DataTypes.INTEGER, allowNull: true },
      toUserId: { type: DataTypes.INTEGER, allowNull: true },
      note: { type: DataTypes.TEXT, allowNull: true },
      createdAt: { type: DataTypes.DATE(6), allowNull: false },
      updatedAt: { type: DataTypes.DATE(6), allowNull: false }
    });
    await queryInterface.addIndex("TicketEvents", ["ticketId"]);

    // public self-registration is opt-in from now on
    await queryInterface.sequelize.query(
      "UPDATE Settings SET value = 'disabled' WHERE `key` = 'userCreation'"
    );
  },
  down: async (queryInterface: QueryInterface) => {
    await queryInterface.dropTable("TicketEvents");
  }
};
