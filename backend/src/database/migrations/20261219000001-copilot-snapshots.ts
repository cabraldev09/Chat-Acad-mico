import { QueryInterface, DataTypes } from "sequelize";

// Where each commercial conversation is in the sales process (the copilot's steps), kept so the manager can see it per consultant:
// how much of the process was followed and where each lead stopped. Written when the conversation is looked at (copilot or follow-up).
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.createTable("CopilotSnapshots", {
      ticketId: { type: DataTypes.INTEGER, primaryKey: true, allowNull: false },
      leadId: { type: DataTypes.INTEGER, allowNull: true },
      userId: { type: DataTypes.INTEGER, allowNull: true },
      doneKeys: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
      current: { type: DataTypes.STRING(40), allowNull: true },
      doneCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      requiredTotal: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false }
    });
    await queryInterface.addIndex("CopilotSnapshots", ["userId", "updatedAt"]);
    // grades sent by a person are counted from the lead's activity: an index for the per-consultant count
    await queryInterface.addIndex("LeadActivities", ["type", "userId", "createdAt"], { name: "lead_activities_type_user_created" });
  },
  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeIndex("LeadActivities", "lead_activities_type_user_created");
    await queryInterface.dropTable("CopilotSnapshots");
  }
};
