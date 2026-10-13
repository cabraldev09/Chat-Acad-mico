import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.addColumn("Whatsapps", "channel", {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "whatsapp"
    });
    await queryInterface.addColumn("Whatsapps", "config", {
      type: DataTypes.TEXT,
      allowNull: true
    });
    await queryInterface.addColumn("Whatsapps", "businessHours", {
      type: DataTypes.TEXT,
      allowNull: true
    });
    await queryInterface.addColumn("Whatsapps", "outOfHoursMessage", {
      type: DataTypes.TEXT,
      allowNull: true
    });
    await queryInterface.addColumn("Queues", "autoAssign", {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "none"
    });
    await queryInterface.addColumn("Tickets", "closedAt", {
      type: DataTypes.DATE,
      allowNull: true
    });
    await queryInterface.addColumn("Tickets", "firstResponseAt", {
      type: DataTypes.DATE,
      allowNull: true
    });
    await queryInterface.addColumn("Tickets", "chatbotNodeId", {
      type: DataTypes.INTEGER,
      allowNull: true
    });
    await queryInterface.addColumn("Tickets", "aiActive", {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    });
    await queryInterface.addColumn("Tickets", "outOfHoursSentAt", {
      type: DataTypes.DATE,
      allowNull: true
    });
    await queryInterface.addColumn("Contacts", "channel", {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "whatsapp"
    });
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("Contacts", "channel");
    for (const c of [
      "outOfHoursSentAt",
      "aiActive",
      "chatbotNodeId",
      "firstResponseAt",
      "closedAt"
    ]) {
      await queryInterface.removeColumn("Tickets", c);
    }
    await queryInterface.removeColumn("Queues", "autoAssign");
    for (const c of ["outOfHoursMessage", "businessHours", "config", "channel"]) {
      await queryInterface.removeColumn("Whatsapps", c);
    }
  }
};
