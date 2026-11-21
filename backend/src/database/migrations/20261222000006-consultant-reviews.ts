import { QueryInterface, DataTypes } from "sequelize";

// what the daily review of the AI read in each consultant's conversation: objections, difficulties and skipped steps (see workers/ConsultantReview)
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.createTable("ConsultantReviews", {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      userId: { type: DataTypes.INTEGER, allowNull: true, references: { model: "Users", key: "id" }, onDelete: "SET NULL", onUpdate: "CASCADE" },
      ticketId: { type: DataTypes.INTEGER, allowNull: false, references: { model: "Tickets", key: "id" }, onDelete: "CASCADE", onUpdate: "CASCADE" },
      leadId: { type: DataTypes.INTEGER, allowNull: true, references: { model: "Leads", key: "id" }, onDelete: "SET NULL", onUpdate: "CASCADE" },
      day: { type: DataTypes.STRING(10), allowNull: false },
      objections: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
      difficulties: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
      skipped: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
      note: { type: DataTypes.STRING(200), allowNull: true },
      model: { type: DataTypes.STRING(80), allowNull: true },
      tokens: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false }
    });
    await queryInterface.addIndex("ConsultantReviews", ["ticketId", "day"], { unique: true, name: "consultant_reviews_ticket_day" });
    await queryInterface.addIndex("ConsultantReviews", ["userId", "createdAt"], { name: "consultant_reviews_user_idx" });
  },
  down: async (queryInterface: QueryInterface) => {
    await queryInterface.dropTable("ConsultantReviews");
  }
};
