import { QueryInterface, DataTypes } from "sequelize";

// The trail of an analysis: who changed what and when (a discipline corrected, added or removed, the entry period or the polo changed), so the manager
// can follow the corrections made by hand against the original document.
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.createTable("AnalysisEvents", {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      kind: { type: DataTypes.STRING(20), allowNull: false },
      analysisId: { type: DataTypes.INTEGER, allowNull: false },
      userId: { type: DataTypes.INTEGER, allowNull: true },
      action: { type: DataTypes.STRING(40), allowNull: false },
      subjectName: { type: DataTypes.STRING(200), allowNull: true },
      before: { type: DataTypes.TEXT, allowNull: true },
      after: { type: DataTypes.TEXT, allowNull: true },
      createdAt: { type: DataTypes.DATE(6), allowNull: false },
      updatedAt: { type: DataTypes.DATE(6), allowNull: false }
    });
    await queryInterface.addIndex("AnalysisEvents", ["kind", "analysisId", "createdAt"]);
  },
  down: async (queryInterface: QueryInterface) => {
    await queryInterface.dropTable("AnalysisEvents");
  }
};
