import { QueryInterface, DataTypes } from "sequelize";

// The print of the enrollment the consultant attaches when confirming it (the RGM is read from it), and the history of the changes
// to the period of a goal (who postponed it, from when to when and why).
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.createTable("EnrollmentProofs", {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      leadId: { type: DataTypes.INTEGER, allowNull: false, references: { model: "Leads", key: "id" }, onDelete: "CASCADE" },
      enrollmentId: { type: DataTypes.INTEGER, allowNull: true },
      attachedAt: { type: DataTypes.DATE, allowNull: true },
      fileName: { type: DataTypes.STRING(80), allowNull: false },
      originalName: { type: DataTypes.STRING(200), allowNull: true },
      mime: { type: DataTypes.STRING(60), allowNull: false },
      size: { type: DataTypes.INTEGER, allowNull: false },
      rgmRead: { type: DataTypes.STRING(40), allowNull: true },
      nameRead: { type: DataTypes.STRING(200), allowNull: true },
      courseRead: { type: DataTypes.STRING(200), allowNull: true },
      readNote: { type: DataTypes.TEXT, allowNull: true },
      uploadedById: { type: DataTypes.INTEGER, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false }
    });
    await queryInterface.addIndex("EnrollmentProofs", ["leadId"]);
    await queryInterface.createTable("GoalChanges", {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      goalId: { type: DataTypes.INTEGER, allowNull: false, references: { model: "Goals", key: "id" }, onDelete: "CASCADE" },
      field: { type: DataTypes.STRING(20), allowNull: false },
      fromValue: { type: DataTypes.STRING(40), allowNull: true },
      toValue: { type: DataTypes.STRING(40), allowNull: true },
      reason: { type: DataTypes.TEXT, allowNull: true },
      userId: { type: DataTypes.INTEGER, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false }
    });
    await queryInterface.addIndex("GoalChanges", ["goalId"]);
  },
  down: async (queryInterface: QueryInterface) => {
    await queryInterface.dropTable("GoalChanges");
    await queryInterface.dropTable("EnrollmentProofs");
  }
};
