import { QueryInterface, DataTypes } from "sequelize";

// Retention: the satisfaction survey (NPS) answered by the students by WhatsApp, and the re-enrollment of the students of
// the next period (which period each student already re-enrolled for).
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.createTable("NpsSurveys", {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      leadId: { type: DataTypes.INTEGER, allowNull: false, references: { model: "Leads", key: "id" }, onUpdate: "CASCADE", onDelete: "CASCADE" },
      contactId: { type: DataTypes.INTEGER, allowNull: true },
      // onboarding | d30 | d90 | manual
      kind: { type: DataTypes.STRING(12), allowNull: false },
      // sent | answered
      status: { type: DataTypes.STRING(10), allowNull: false, defaultValue: "sent" },
      score: { type: DataTypes.INTEGER, allowNull: true },
      comment: { type: DataTypes.TEXT, allowNull: true },
      // the score came in and the student may still tell the reason in the next message
      awaitingComment: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      sentAt: { type: DataTypes.DATE(6), allowNull: false },
      answeredAt: { type: DataTypes.DATE(6), allowNull: true },
      createdAt: { type: DataTypes.DATE(6), allowNull: false },
      updatedAt: { type: DataTypes.DATE(6), allowNull: false }
    });
    await queryInterface.addIndex("NpsSurveys", ["contactId", "status"]);
    await queryInterface.addIndex("NpsSurveys", ["leadId", "kind"]);
    await queryInterface.addColumn("Leads", "reenrolledTerm", { type: DataTypes.STRING(10), allowNull: true });
    await queryInterface.addColumn("Leads", "reenrolledAt", { type: DataTypes.DATE(6), allowNull: true });
  },
  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("Leads", "reenrolledAt");
    await queryInterface.removeColumn("Leads", "reenrolledTerm");
    await queryInterface.dropTable("NpsSurveys");
  }
};
