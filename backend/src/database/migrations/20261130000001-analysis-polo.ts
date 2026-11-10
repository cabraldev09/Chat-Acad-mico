import { QueryInterface, DataTypes } from "sequelize";

// The polo of the student of a curricular analysis (the consultant informs the name and the polo of who the analysis is for).
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.addColumn("CurricularAnalyses", "poloId", { type: DataTypes.INTEGER, allowNull: true });
  },
  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("CurricularAnalyses", "poloId");
  }
};
