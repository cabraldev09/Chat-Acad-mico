import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    // [{ type: "text" | "media", body, mediaUrl, delaySec }], up to 5 messages per recipient
    await queryInterface.addColumn("Campaigns", "steps", { type: DataTypes.JSON, allowNull: true });
    // runner state survives restarts: next allowed send and messages sent in the current batch
    await queryInterface.addColumn("Campaigns", "nextRunAt", { type: DataTypes.DATE(6), allowNull: true });
    await queryInterface.addColumn("Campaigns", "sentInBatch", { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 });
    // how many of the campaign's messages this recipient already received
    await queryInterface.addColumn("CampaignShippings", "stepsDone", { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 });
  },
  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("CampaignShippings", "stepsDone");
    await queryInterface.removeColumn("Campaigns", "sentInBatch");
    await queryInterface.removeColumn("Campaigns", "nextRunAt");
    await queryInterface.removeColumn("Campaigns", "steps");
  }
};
