import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    // none | pending | started | done : tutor onboarding after the enrollment is confirmed
    await queryInterface.addColumn("Leads", "onboardingStatus", { type: DataTypes.STRING, allowNull: false, defaultValue: "none" });
    await queryInterface.addColumn("Leads", "onboardingTutorId", { type: DataTypes.INTEGER, allowNull: true });
    await queryInterface.addColumn("Leads", "enrolledAt", { type: DataTypes.DATE(6), allowNull: true });
    await queryInterface.addColumn("Leads", "onboardingStartedAt", { type: DataTypes.DATE(6), allowNull: true });
    await queryInterface.addColumn("Leads", "onboardingDoneAt", { type: DataTypes.DATE(6), allowNull: true });
    await queryInterface.addColumn("Leads", "onboardingAlertAt", { type: DataTypes.DATE(6), allowNull: true });
    await queryInterface.addColumn("Leads", "indicatedBy", { type: DataTypes.INTEGER, allowNull: true });
    await queryInterface.addIndex("Leads", ["onboardingTutorId"]);
  },
  down: async (queryInterface: QueryInterface) => {
    for (const c of ["indicatedBy", "onboardingAlertAt", "onboardingDoneAt", "onboardingStartedAt", "enrolledAt", "onboardingTutorId", "onboardingStatus"]) {
      // eslint-disable-next-line no-await-in-loop
      await queryInterface.removeColumn("Leads", c);
    }
  }
};
