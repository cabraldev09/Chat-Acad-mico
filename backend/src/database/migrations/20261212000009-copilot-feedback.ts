import { QueryInterface, DataTypes } from "sequelize";

// The copilot learns what helps: the kind of request (reply or summary), the variation asked, the sources used, the consultant's opinion
// and what happened to the suggestion (used as it was, edited, discarded).
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.addColumn("CopilotRequests", "kind", { type: DataTypes.STRING(20), allowNull: false, defaultValue: "suggestion" });
    await queryInterface.addColumn("CopilotRequests", "mode", { type: DataTypes.STRING(20), allowNull: true });
    await queryInterface.addColumn("CopilotRequests", "sources", { type: DataTypes.TEXT, allowNull: true });
    await queryInterface.addColumn("CopilotRequests", "feedback", { type: DataTypes.STRING(20), allowNull: true });
    await queryInterface.addColumn("CopilotRequests", "feedbackReason", { type: DataTypes.STRING(300), allowNull: true });
    await queryInterface.addColumn("CopilotRequests", "outcome", { type: DataTypes.STRING(20), allowNull: true });
    await queryInterface.addIndex("CopilotRequests", ["ticketId", "userId", "outcome"], { name: "copilot_requests_outcome" });
  },
  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeIndex("CopilotRequests", "copilot_requests_outcome");
    for (const c of ["kind", "mode", "sources", "feedback", "feedbackReason", "outcome"]) await queryInterface.removeColumn("CopilotRequests", c);
  }
};
