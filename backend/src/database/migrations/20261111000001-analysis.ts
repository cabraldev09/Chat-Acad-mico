import { QueryInterface, DataTypes } from "sequelize";

// Curricular analysis (entry forecast), academic analysis (graduation forecast) and the student portal.
// The PDFs are not kept: only the hash and what was read from them (no personal documents lying around).
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const now = { type: DataTypes.DATE(6), allowNull: false };
    await queryInterface.createTable("Students", {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      rgm: { type: DataTypes.STRING(40), allowNull: false },
      name: { type: DataTypes.STRING(160), allowNull: false },
      email: { type: DataTypes.STRING(160), allowNull: true },
      phone: { type: DataTypes.STRING(40), allowNull: true },
      courseName: { type: DataTypes.STRING(200), allowNull: true },
      poloId: { type: DataTypes.INTEGER, allowNull: true },
      responsibleUserId: { type: DataTypes.INTEGER, allowNull: true },
      leadId: { type: DataTypes.INTEGER, allowNull: true },
      passwordHash: { type: DataTypes.STRING, allowNull: true },
      activatedAt: { type: DataTypes.DATE(6), allowNull: true },
      blockedAt: { type: DataTypes.DATE(6), allowNull: true },
      sessionVersion: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      lastLoginAt: { type: DataTypes.DATE(6), allowNull: true },
      createdAt: now,
      updatedAt: now
    });
    await queryInterface.addIndex("Students", ["rgm"], { unique: true });
    await queryInterface.addIndex("Students", ["responsibleUserId"]);

    await queryInterface.createTable("StudentTokens", {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      studentId: { type: DataTypes.INTEGER, allowNull: false, references: { model: "Students", key: "id" }, onDelete: "CASCADE", onUpdate: "CASCADE" },
      kind: { type: DataTypes.STRING(12), allowNull: false },
      tokenHash: { type: DataTypes.STRING(64), allowNull: false },
      expiresAt: { type: DataTypes.DATE(6), allowNull: false },
      usedAt: { type: DataTypes.DATE(6), allowNull: true },
      createdAt: now,
      updatedAt: now
    });
    await queryInterface.addIndex("StudentTokens", ["tokenHash"], { unique: true });

    await queryInterface.createTable("CurricularAnalyses", {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      userId: { type: DataTypes.INTEGER, allowNull: true },
      leadId: { type: DataTypes.INTEGER, allowNull: true },
      contactId: { type: DataTypes.INTEGER, allowNull: true },
      candidateName: { type: DataTypes.STRING(160), allowNull: true },
      originalName: { type: DataTypes.STRING(255), allowNull: true },
      fileHash: { type: DataTypes.STRING(64), allowNull: true },
      pageCount: { type: DataTypes.INTEGER, allowNull: true },
      status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: "COMPLETED" },
      errorMessage: { type: DataTypes.TEXT, allowNull: true },
      courseName: { type: DataTypes.STRING(200), allowNull: true },
      matrixLabel: { type: DataTypes.STRING(120), allowNull: true },
      campus: { type: DataTypes.STRING(120), allowNull: true },
      modality: { type: DataTypes.STRING(120), allowNull: true },
      headerEntryPeriod: { type: DataTypes.INTEGER, allowNull: true },
      entryPeriod: { type: DataTypes.INTEGER, allowNull: true },
      entryPeriodSource: { type: DataTypes.STRING(12), allowNull: true },
      startTerm: { type: DataTypes.STRING(8), allowNull: true },
      subjects: { type: DataTypes.TEXT, allowNull: false, defaultValue: "[]" },
      claims: { type: DataTypes.TEXT, allowNull: false, defaultValue: "[]" },
      baseWarnings: { type: DataTypes.TEXT, allowNull: false, defaultValue: "[]" },
      result: { type: DataTypes.TEXT, allowNull: true },
      createdAt: now,
      updatedAt: now
    });
    await queryInterface.addIndex("CurricularAnalyses", ["userId", "createdAt"]);
    await queryInterface.addIndex("CurricularAnalyses", ["leadId"]);

    await queryInterface.createTable("AcademicAnalyses", {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      userId: { type: DataTypes.INTEGER, allowNull: true },
      studentId: { type: DataTypes.INTEGER, allowNull: true, references: { model: "Students", key: "id" }, onDelete: "SET NULL", onUpdate: "CASCADE" },
      leadId: { type: DataTypes.INTEGER, allowNull: true },
      contactId: { type: DataTypes.INTEGER, allowNull: true },
      origin: { type: DataTypes.STRING(20), allowNull: false, defaultValue: "STAFF_UPLOAD" },
      originalName: { type: DataTypes.STRING(255), allowNull: true },
      fileHash: { type: DataTypes.STRING(64), allowNull: true },
      contentHash: { type: DataTypes.STRING(64), allowNull: true },
      factsHash: { type: DataTypes.STRING(64), allowNull: true },
      documentType: { type: DataTypes.STRING(40), allowNull: true },
      rgm: { type: DataTypes.STRING(40), allowNull: true },
      studentName: { type: DataTypes.STRING(160), allowNull: true },
      courseName: { type: DataTypes.STRING(200), allowNull: true },
      currentPeriod: { type: DataTypes.INTEGER, allowNull: true },
      currentPeriodConfirmed: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      status: { type: DataTypes.STRING(30), allowNull: true },
      version: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
      isCurrent: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      changeSummary: { type: DataTypes.TEXT, allowNull: true },
      snapshot: { type: DataTypes.TEXT, allowNull: false },
      forecast: { type: DataTypes.TEXT, allowNull: true },
      message: { type: DataTypes.TEXT, allowNull: true },
      createdAt: now,
      updatedAt: now
    });
    await queryInterface.addIndex("AcademicAnalyses", ["studentId", "version"]);
    await queryInterface.addIndex("AcademicAnalyses", ["userId", "createdAt"]);
    await queryInterface.addIndex("AcademicAnalyses", ["rgm"]);
  },
  down: async (queryInterface: QueryInterface) => {
    await queryInterface.dropTable("AcademicAnalyses");
    await queryInterface.dropTable("CurricularAnalyses");
    await queryInterface.dropTable("StudentTokens");
    await queryInterface.dropTable("Students");
  }
};
