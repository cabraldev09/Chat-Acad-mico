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
const fk = (model: string, onDelete = "CASCADE", allowNull = false) => ({
  type: DataTypes.INTEGER,
  allowNull,
  references: { model, key: "id" },
  onDelete
});

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.createTable("ContactLists", {
      ...pk,
      name: { type: DataTypes.STRING, allowNull: false },
      ...ts
    });
    await queryInterface.createTable("ContactListItems", {
      ...pk,
      name: { type: DataTypes.STRING, allowNull: false },
      number: { type: DataTypes.STRING, allowNull: false },
      email: { type: DataTypes.STRING, allowNull: true },
      contactListId: fk("ContactLists"),
      ...ts
    });
    await queryInterface.createTable("Campaigns", {
      ...pk,
      name: { type: DataTypes.STRING, allowNull: false },
      status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: "draft"
      },
      message: { type: DataTypes.TEXT, allowNull: false },
      mediaUrl: { type: DataTypes.STRING, allowNull: true },
      scheduledAt: { type: DataTypes.DATE, allowNull: true },
      startedAt: { type: DataTypes.DATE, allowNull: true },
      finishedAt: { type: DataTypes.DATE, allowNull: true },
      intervalMin: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 20
      },
      intervalMax: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 60
      },
      batchSize: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 20 },
      batchPause: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 300
      },
      contactListId: fk("ContactLists", "CASCADE", false),
      whatsappId: fk("Whatsapps", "SET NULL", true),
      ...ts
    });
    await queryInterface.createTable("CampaignShippings", {
      ...pk,
      name: { type: DataTypes.STRING, allowNull: true },
      number: { type: DataTypes.STRING, allowNull: false },
      message: { type: DataTypes.TEXT, allowNull: true },
      status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: "pending"
      },
      error: { type: DataTypes.TEXT, allowNull: true },
      sentAt: { type: DataTypes.DATE, allowNull: true },
      campaignId: fk("Campaigns"),
      ...ts
    });
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.dropTable("CampaignShippings");
    await queryInterface.dropTable("Campaigns");
    await queryInterface.dropTable("ContactListItems");
    await queryInterface.dropTable("ContactLists");
  }
};
