import { QueryInterface, DataTypes } from "sequelize";

// The classes (turmas) of a course with what the institution confirmed for each one, and the register of the national norms the agents rely on.
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const tables = (await queryInterface.showAllTables()).map((t: any) => String(t.tableName || t));
    if (!tables.includes("CourseCohorts")) {
      await queryInterface.createTable("CourseCohorts", {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
        courseId: { type: DataTypes.INTEGER, allowNull: false, references: { model: "Courses", key: "id" }, onDelete: "CASCADE" },
        poloId: { type: DataTypes.INTEGER, allowNull: true },
        label: { type: DataTypes.STRING(120), allowNull: false },
        intakeTerm: { type: DataTypes.STRING(10), allowNull: true },
        intakeDate: { type: DataTypes.DATEONLY, allowNull: true },
        contractedModality: { type: DataTypes.STRING(20), allowNull: true },
        transitionRegime: { type: DataTypes.STRING(40), allowNull: true },
        transitionNote: { type: DataTypes.TEXT, allowNull: true },
        expectedCalendar: { type: DataTypes.TEXT, allowNull: true },
        presencialStart: { type: DataTypes.DATEONLY, allowNull: true },
        syncRules: { type: DataTypes.TEXT, allowNull: true },
        practiceSchedule: { type: DataTypes.TEXT, allowNull: true },
        practiceDefined: { type: DataTypes.BOOLEAN, allowNull: true },
        assessmentsStatus: { type: DataTypes.STRING(20), allowNull: true },
        assessmentsNote: { type: DataTypes.TEXT, allowNull: true },
        activityLocation: { type: DataTypes.TEXT, allowNull: true },
        // only a published class is told to the lead; a draft is for the team to prepare
        published: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
        createdAt: { type: DataTypes.DATE, allowNull: false },
        updatedAt: { type: DataTypes.DATE, allowNull: false }
      });
      await queryInterface.addIndex("CourseCohorts", ["courseId", "intakeTerm"], { name: "course_cohorts_course_idx" });
    }
    if (!tables.includes("RegulatoryNorms")) {
      await queryInterface.createTable("RegulatoryNorms", {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
        key: { type: DataTypes.STRING(80), allowNull: false, unique: true },
        title: { type: DataTypes.STRING(240), allowNull: false },
        number: { type: DataTypes.STRING(160), allowNull: false },
        kind: { type: DataTypes.STRING(20), allowNull: false },
        publishedAt: { type: DataTypes.DATEONLY, allowNull: true },
        sourceUrl: { type: DataTypes.STRING(500), allowNull: true },
        summary: { type: DataTypes.TEXT, allowNull: false },
        // vigente | alterada | revogada
        status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: "vigente" },
        amendments: { type: DataTypes.TEXT, allowNull: true },
        reviewedAt: { type: DataTypes.DATE, allowNull: true },
        reviewedBy: { type: DataTypes.INTEGER, allowNull: true },
        // the text of the system was written from the official publication; false = the team wrote or changed it
        fromSystem: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
        createdAt: { type: DataTypes.DATE, allowNull: false },
        updatedAt: { type: DataTypes.DATE, allowNull: false }
      });
    }
  },
  down: async (queryInterface: QueryInterface) => {
    await queryInterface.dropTable("RegulatoryNorms");
    await queryInterface.dropTable("CourseCohorts");
  }
};
