import { QueryInterface, DataTypes } from "sequelize";

// The enrollment is confirmed with the RGM (the registration number the institution gives the student): it stays on the lead (and on each
// additional enrollment) and the student of the portal is created with it. The tutor then only informs the academic e-mail of access.
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.addColumn("Leads", "rgm", { type: DataTypes.STRING(40), allowNull: true });
    await queryInterface.addColumn("LeadEnrollments", "rgm", { type: DataTypes.STRING(40), allowNull: true });
    await queryInterface.addColumn("Students", "academicEmail", { type: DataTypes.STRING(160), allowNull: true });
    await queryInterface.addColumn("Students", "accessSentAt", { type: DataTypes.DATE(6), allowNull: true });
    await queryInterface.addIndex("Leads", ["rgm"]);
  },
  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("Students", "accessSentAt");
    await queryInterface.removeColumn("Students", "academicEmail");
    await queryInterface.removeColumn("LeadEnrollments", "rgm");
    await queryInterface.removeColumn("Leads", "rgm");
  }
};
