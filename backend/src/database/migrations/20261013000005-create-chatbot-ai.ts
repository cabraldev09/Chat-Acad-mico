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
    await queryInterface.createTable("ChatbotNodes", {
      ...pk,
      // null whatsappId = flow shared by every connection
      whatsappId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "Whatsapps", key: "id" },
        onDelete: "CASCADE"
      },
      parentId: { type: DataTypes.INTEGER, allowNull: true },
      position: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      title: { type: DataTypes.STRING, allowNull: false },
      keywords: { type: DataTypes.TEXT, allowNull: true },
      message: { type: DataTypes.TEXT, allowNull: true },
      // menu | message | queue | user | close | ai
      action: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: "menu"
      },
      targetId: { type: DataTypes.INTEGER, allowNull: true },
      ...ts
    });
    await queryInterface.createTable("AiAgents", {
      ...pk,
      name: { type: DataTypes.STRING, allowNull: false },
      provider: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: "anthropic"
      },
      model: { type: DataTypes.STRING, allowNull: false },
      apiKey: { type: DataTypes.TEXT, allowNull: true },
      systemPrompt: { type: DataTypes.TEXT, allowNull: true },
      knowledgeBase: { type: DataTypes.TEXT({ length: "long" }), allowNull: true },
      handoffMessage: { type: DataTypes.TEXT, allowNull: true },
      maxHistory: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 12 },
      active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      queueId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "Queues", key: "id" },
        onDelete: "SET NULL"
      },
      whatsappId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "Whatsapps", key: "id" },
        onDelete: "SET NULL"
      },
      ...ts
    });
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.dropTable("AiAgents");
    await queryInterface.dropTable("ChatbotNodes");
  }
};
