import { QueryInterface, DataTypes } from "sequelize";

// The documents a student has to deliver to finish the enrollment (ID, CPF, school record...): one row per student and
// document, with who received it and when.
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.createTable("LeadDocuments", {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      leadId: { type: DataTypes.INTEGER, allowNull: false, references: { model: "Leads", key: "id" }, onUpdate: "CASCADE", onDelete: "CASCADE" },
      name: { type: DataTypes.STRING(120), allowNull: false },
      // pending | received | waived (not required for this student)
      status: { type: DataTypes.STRING(12), allowNull: false, defaultValue: "pending" },
      position: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      receivedAt: { type: DataTypes.DATE(6), allowNull: true },
      receivedBy: { type: DataTypes.INTEGER, allowNull: true },
      note: { type: DataTypes.TEXT, allowNull: true },
      createdAt: { type: DataTypes.DATE(6), allowNull: false },
      updatedAt: { type: DataTypes.DATE(6), allowNull: false }
    });
    await queryInterface.addIndex("LeadDocuments", ["leadId", "name"], { unique: true });
  },
  down: async (queryInterface: QueryInterface) => {
    await queryInterface.dropTable("LeadDocuments");
  }
};
