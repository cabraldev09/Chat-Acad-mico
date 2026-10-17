import { QueryInterface, DataTypes } from "sequelize";

// "Already done" marks of the automatic follow-ups (a lead stopped for N days, a deadline close, a reminder of documents...):
// one row per lead and per kind of reminder, so the same one is never sent twice.
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.createTable("LeadReminderLogs", {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      leadId: { type: DataTypes.INTEGER, allowNull: false, references: { model: "Leads", key: "id" }, onUpdate: "CASCADE", onDelete: "CASCADE" },
      key: { type: DataTypes.STRING(120), allowNull: false },
      createdAt: { type: DataTypes.DATE(6), allowNull: false },
      updatedAt: { type: DataTypes.DATE(6), allowNull: false }
    });
    await queryInterface.addIndex("LeadReminderLogs", ["leadId", "key", "createdAt"]);
  },
  down: async (queryInterface: QueryInterface) => {
    await queryInterface.dropTable("LeadReminderLogs");
  }
};
