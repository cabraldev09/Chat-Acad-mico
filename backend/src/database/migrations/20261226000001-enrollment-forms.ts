import { QueryInterface, DataTypes } from "sequelize";

// The enrollment form the lead fills in by a personal link (data and pictures of the ID). What the person types is kept sealed (data) and
// the pictures are kept sealed on disk, outside the public folder; the row only says where they are, how far it went and when it was sent.
module.exports = {
  up: async (q: QueryInterface) => {
    await q.createTable("EnrollmentForms", {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      leadId: { type: DataTypes.INTEGER, allowNull: false, references: { model: "Leads", key: "id" }, onUpdate: "CASCADE", onDelete: "CASCADE" },
      token: { type: DataTypes.STRING(64), allowNull: false, unique: true },
      data: { type: DataTypes.TEXT, allowNull: true },
      files: { type: DataTypes.TEXT, allowNull: true },
      progress: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      consentAt: { type: DataTypes.DATE, allowNull: true },
      submittedAt: { type: DataTypes.DATE, allowNull: true },
      lastSavedAt: { type: DataTypes.DATE, allowNull: true },
      sentAt: { type: DataTypes.DATE, allowNull: true },
      expiresAt: { type: DataTypes.DATE, allowNull: true },
      createdBy: { type: DataTypes.INTEGER, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false }
    });
    await q.addIndex("EnrollmentForms", ["leadId"], { name: "enrollment_forms_lead" });
  },
  down: async (q: QueryInterface) => {
    await q.dropTable("EnrollmentForms");
  }
};
