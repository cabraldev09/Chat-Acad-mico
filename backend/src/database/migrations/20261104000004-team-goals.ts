import { QueryInterface, DataTypes } from "sequelize";

// Team enrollment goals: a period (free dates, e.g. 26/09 to 26/10) with one line per consultant. A line counts the
// enrollments of its CRM users automatically and can carry a manual adjustment (people without a login, shared lines
// such as "Pedro e Dany").
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.createTable("Goals", {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      title: { type: DataTypes.STRING, allowNull: true },
      startsOn: { type: DataTypes.DATEONLY, allowNull: false },
      endsOn: { type: DataTypes.DATEONLY, allowNull: false },
      status: { type: DataTypes.STRING, allowNull: false, defaultValue: "active" },
      createdBy: { type: DataTypes.INTEGER, allowNull: true },
      createdAt: { type: DataTypes.DATE(6), allowNull: false },
      updatedAt: { type: DataTypes.DATE(6), allowNull: false }
    });
    await queryInterface.createTable("GoalMembers", {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      goalId: { type: DataTypes.INTEGER, allowNull: false, references: { model: "Goals", key: "id" }, onDelete: "CASCADE" },
      label: { type: DataTypes.STRING, allowNull: false },
      userIds: { type: DataTypes.TEXT, allowNull: false, defaultValue: "[]" }, // JSON array of CRM users counted on this line
      target: { type: DataTypes.INTEGER, allowNull: true },
      manualCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      note: { type: DataTypes.STRING, allowNull: true },
      position: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      createdAt: { type: DataTypes.DATE(6), allowNull: false },
      updatedAt: { type: DataTypes.DATE(6), allowNull: false }
    });
    await queryInterface.sequelize.query(`CREATE INDEX IF NOT EXISTS "goal_members_goal_idx" ON "GoalMembers" ("goalId", "position")`);
  },
  down: async (queryInterface: QueryInterface) => {
    await queryInterface.dropTable("GoalMembers");
    await queryInterface.dropTable("Goals");
  }
};
