import { QueryInterface, DataTypes } from "sequelize";

// The PDF of an analysis is kept (a file with a name nobody can guess, served only by the authenticated route of the analysis), so the
// manager and the consultant can check the subjects read against the original document.
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.addColumn("CurricularAnalyses", "filePath", { type: DataTypes.STRING(120), allowNull: true });
    await queryInterface.addColumn("AcademicAnalyses", "filePath", { type: DataTypes.STRING(120), allowNull: true });
  },
  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("AcademicAnalyses", "filePath");
    await queryInterface.removeColumn("CurricularAnalyses", "filePath");
  }
};
