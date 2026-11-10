import { QueryInterface, DataTypes } from "sequelize";

// The steps of the onboarding of a student (first access, virtual environment, polo contacts, documents), ticked by the tutor.
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.addColumn("Leads", "onboardingChecklist", { type: DataTypes.TEXT, allowNull: true });
  },
  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("Leads", "onboardingChecklist");
  }
};
