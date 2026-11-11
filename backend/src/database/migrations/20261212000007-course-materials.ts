import { QueryInterface, DataTypes } from "sequelize";

// The materials of a course for the commercial team: the prints the institution sends (the approved text and the share of presential classes). The AI reads
// each print and the management confirms what it read before it is used by the agent and the consultants.
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.createTable("CourseMaterials", {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      courseId: { type: DataTypes.INTEGER, allowNull: false, references: { model: "Courses", key: "id" }, onDelete: "CASCADE" },
      kind: { type: DataTypes.STRING(20), allowNull: false, defaultValue: "print" },
      fileName: { type: DataTypes.STRING(120), allowNull: false },
      originalName: { type: DataTypes.STRING(255), allowNull: true },
      mime: { type: DataTypes.STRING(60), allowNull: false },
      size: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      readStatus: { type: DataTypes.STRING(20), allowNull: false, defaultValue: "pending" },
      readNote: { type: DataTypes.TEXT, allowNull: true },
      readText: { type: DataTypes.TEXT, allowNull: true },
      readFormat: { type: DataTypes.STRING(30), allowNull: true },
      readPercent: { type: DataTypes.DECIMAL(5, 2), allowNull: true },
      readSyncPercent: { type: DataTypes.DECIMAL(5, 2), allowNull: true },
      status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: "pending" },
      uploadedById: { type: DataTypes.INTEGER, allowNull: true },
      confirmedById: { type: DataTypes.INTEGER, allowNull: true },
      confirmedAt: { type: DataTypes.DATE(6), allowNull: true },
      createdAt: { type: DataTypes.DATE(6), allowNull: false },
      updatedAt: { type: DataTypes.DATE(6), allowNull: false }
    });
    await queryInterface.addIndex("CourseMaterials", ["courseId", "createdAt"]);
  },
  down: async (queryInterface: QueryInterface) => {
    await queryInterface.dropTable("CourseMaterials");
  }
};
