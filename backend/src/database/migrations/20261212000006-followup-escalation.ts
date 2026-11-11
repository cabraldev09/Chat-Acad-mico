import { QueryInterface, DataTypes } from "sequelize";

// A return ("enrolled or not") still unanswered after two business days is told once to the coordination of the polo.
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.addColumn("CurricularAnalyses", "followUpEscalatedAt", { type: DataTypes.DATE(6), allowNull: true });
  },
  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("CurricularAnalyses", "followUpEscalatedAt");
  }
};
