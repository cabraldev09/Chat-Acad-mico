import { QueryInterface, DataTypes } from "sequelize";

const ts = {
  createdAt: { type: DataTypes.DATE, allowNull: false },
  updatedAt: { type: DataTypes.DATE, allowNull: false }
};
const pk = {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
    allowNull: false
  }
};

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.createTable("ApiTokens", {
      ...pk,
      name: { type: DataTypes.STRING, allowNull: false },
      token: { type: DataTypes.STRING, allowNull: false, unique: true },
      lastUsedAt: { type: DataTypes.DATE, allowNull: true },
      ...ts
    });
    await queryInterface.createTable("Webhooks", {
      ...pk,
      name: { type: DataTypes.STRING, allowNull: false },
      url: { type: DataTypes.TEXT, allowNull: false },
      secret: { type: DataTypes.STRING, allowNull: true },
      events: { type: DataTypes.TEXT, allowNull: false },
      active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      lastStatus: { type: DataTypes.INTEGER, allowNull: true },
      lastError: { type: DataTypes.TEXT, allowNull: true },
      lastAt: { type: DataTypes.DATE, allowNull: true },
      ...ts
    });
    await queryInterface.createTable("Schedules", {
      ...pk,
      body: { type: DataTypes.TEXT, allowNull: false },
      mediaUrl: { type: DataTypes.STRING, allowNull: true },
      sendAt: { type: DataTypes.DATE, allowNull: false },
      status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: "pending"
      },
      error: { type: DataTypes.TEXT, allowNull: true },
      sentAt: { type: DataTypes.DATE, allowNull: true },
      contactId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "Contacts", key: "id" },
        onDelete: "CASCADE"
      },
      ticketId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "Tickets", key: "id" },
        onDelete: "SET NULL"
      },
      whatsappId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "Whatsapps", key: "id" },
        onDelete: "SET NULL"
      },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "Users", key: "id" },
        onDelete: "SET NULL"
      },
      ...ts
    });
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.dropTable("Schedules");
    await queryInterface.dropTable("Webhooks");
    await queryInterface.dropTable("ApiTokens");
  }
};
