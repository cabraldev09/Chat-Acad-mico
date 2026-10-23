import { QueryInterface, DataTypes } from "sequelize";

// A student can enroll more than once (another course, another polo). The first enrollment stays on the lead (enrolledAt / wonAt);
// every one after that is a row here, so each one counts for the consultant, the polo and the goals.
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.createTable("LeadEnrollments", {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      leadId: { type: DataTypes.INTEGER, allowNull: false, references: { model: "Leads", key: "id" }, onUpdate: "CASCADE", onDelete: "CASCADE" },
      ownerId: { type: DataTypes.INTEGER, allowNull: true },
      poloId: { type: DataTypes.INTEGER, allowNull: true },
      tutorId: { type: DataTypes.INTEGER, allowNull: true },
      actorId: { type: DataTypes.INTEGER, allowNull: true },
      courseId: { type: DataTypes.INTEGER, allowNull: true },
      courseName: { type: DataTypes.STRING(200), allowNull: true },
      note: { type: DataTypes.TEXT, allowNull: true },
      enrolledAt: { type: DataTypes.DATE(6), allowNull: false },
      createdAt: { type: DataTypes.DATE(6), allowNull: false },
      updatedAt: { type: DataTypes.DATE(6), allowNull: false }
    });
    await queryInterface.addIndex("LeadEnrollments", ["leadId"]);
    await queryInterface.addIndex("LeadEnrollments", ["ownerId", "enrolledAt"]);
    await queryInterface.addIndex("LeadEnrollments", ["poloId", "enrolledAt"]);
  },
  down: async (queryInterface: QueryInterface) => {
    await queryInterface.dropTable("LeadEnrollments");
  }
};
