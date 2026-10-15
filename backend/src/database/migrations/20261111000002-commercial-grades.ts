import { QueryInterface, DataTypes } from "sequelize";

// The catalog of commercial matrices ("grades"): one row per course matrix, with what the commercial team needs to
// say to a candidate (duration, hours, internships, TCC) and the PDF to send.
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const now = { type: DataTypes.DATE(6), allowNull: false };
    await queryInterface.createTable("CommercialGrades", {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      courseName: { type: DataTypes.STRING(200), allowNull: false },
      modality: { type: DataTypes.STRING(80), allowNull: true },
      curriculumTerm: { type: DataTypes.STRING(40), allowNull: true },
      degree: { type: DataTypes.STRING(80), allowNull: true },
      knowledgeArea: { type: DataTypes.STRING(80), allowNull: true },
      durationSemesters: { type: DataTypes.INTEGER, allowNull: true },
      courseTracks: { type: DataTypes.TEXT, allowNull: false, defaultValue: "[]" },
      internshipInfo: { type: DataTypes.TEXT, allowNull: true },
      hasTcc: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      totalInternshipHours: { type: DataTypes.INTEGER, allowNull: true },
      totalCourseHours: { type: DataTypes.INTEGER, allowNull: true },
      whatsappSummary: { type: DataTypes.TEXT, allowNull: true },
      complete: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      contentHash: { type: DataTypes.STRING(64), allowNull: false },
      catalogKey: { type: DataTypes.STRING(64), allowNull: false },
      originalName: { type: DataTypes.STRING(255), allowNull: true },
      fileName: { type: DataTypes.STRING(120), allowNull: false },
      sizeBytes: { type: DataTypes.INTEGER, allowNull: true },
      uploadedById: { type: DataTypes.INTEGER, allowNull: true },
      createdAt: now,
      updatedAt: now
    });
    await queryInterface.addIndex("CommercialGrades", ["contentHash"], { unique: true });
    await queryInterface.addIndex("CommercialGrades", ["catalogKey"], { unique: true });
    await queryInterface.addIndex("CommercialGrades", ["courseName"]);
  },
  down: async (queryInterface: QueryInterface) => {
    await queryInterface.dropTable("CommercialGrades");
  }
};
