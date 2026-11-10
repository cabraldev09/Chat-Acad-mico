import { QueryInterface, DataTypes } from "sequelize";

// Every contact the team made with a student in the Retention area: what happened, a note and, when wanted, "do not show again until".
// It also settles the unhappy students of the survey (a detractor with a contact after the answer is handled).
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.createTable("RetentionContacts", {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      leadId: { type: DataTypes.INTEGER, allowNull: false, references: { model: "Leads", key: "id" }, onUpdate: "CASCADE", onDelete: "CASCADE" },
      userId: { type: DataTypes.INTEGER, allowNull: true },
      // respondeu | sem_resposta | agendado | resolvido | outro
      outcome: { type: DataTypes.STRING(20), allowNull: false },
      note: { type: DataTypes.TEXT, allowNull: true },
      snoozeUntil: { type: DataTypes.DATE(6), allowNull: true },
      createdAt: { type: DataTypes.DATE(6), allowNull: false },
      updatedAt: { type: DataTypes.DATE(6), allowNull: false }
    });
    await queryInterface.addIndex("RetentionContacts", ["leadId", "createdAt"]);
  },
  down: async (queryInterface: QueryInterface) => {
    await queryInterface.dropTable("RetentionContacts");
  }
};
