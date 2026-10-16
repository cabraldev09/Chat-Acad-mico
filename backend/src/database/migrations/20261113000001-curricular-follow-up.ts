import { QueryInterface, DataTypes } from "sequelize";

// The result of the commercial service, asked 24 hours after the analysis is delivered: enrolled, not enrolled (with the
// reason) or a new analysis (another 24 hours). Analyses that already exist are not asked about: no due date for them.
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const t = "CurricularAnalyses";
    await queryInterface.addColumn(t, "enrollmentStatus", { type: DataTypes.STRING(20), allowNull: false, defaultValue: "PENDING" });
    await queryInterface.addColumn(t, "enrollmentNote", { type: DataTypes.TEXT, allowNull: true });
    await queryInterface.addColumn(t, "enrollmentUpdatedAt", { type: DataTypes.DATE, allowNull: true });
    await queryInterface.addColumn(t, "enrollmentUpdatedById", { type: DataTypes.INTEGER, allowNull: true });
    await queryInterface.addColumn(t, "enrollmentReanalysisAt", { type: DataTypes.DATE, allowNull: true });
    await queryInterface.addColumn(t, "followUpDueAt", { type: DataTypes.DATE, allowNull: true });
    await queryInterface.addColumn(t, "followUpNotifiedAt", { type: DataTypes.DATE, allowNull: true });
    await queryInterface.addColumn(t, "followUpNotificationCount", { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 });
    await queryInterface.sequelize.query(`CREATE INDEX IF NOT EXISTS "curricular_followup_due_idx" ON "CurricularAnalyses" ("followUpDueAt") WHERE "followUpDueAt" IS NOT NULL`);
  },
  down: async (queryInterface: QueryInterface) => {
    const t = "CurricularAnalyses";
    await queryInterface.sequelize.query(`DROP INDEX IF EXISTS "curricular_followup_due_idx"`);
    for (const c of ["followUpNotificationCount", "followUpNotifiedAt", "followUpDueAt", "enrollmentReanalysisAt", "enrollmentUpdatedById", "enrollmentUpdatedAt", "enrollmentNote", "enrollmentStatus"]) await queryInterface.removeColumn(t, c);
  }
};
