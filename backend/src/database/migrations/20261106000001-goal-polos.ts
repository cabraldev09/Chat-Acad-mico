import { QueryInterface, DataTypes } from "sequelize";

// Enrollment goals per polo, inside the same periods as the team goals: one line per polo with its target, the
// enrollments done (counted from the CRM) and the ones cancelled/transferred (typed by the administration).
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.addColumn("Goals", "workDays", { type: DataTypes.INTEGER, allowNull: false, defaultValue: 5 }); // 5 = Mon-Fri, 6 = Mon-Sat, 7 = every day
    await queryInterface.createTable("GoalPolos", {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      goalId: { type: DataTypes.INTEGER, allowNull: false, references: { model: "Goals", key: "id" }, onDelete: "CASCADE" },
      poloId: { type: DataTypes.INTEGER, allowNull: false, references: { model: "Polos", key: "id" }, onDelete: "CASCADE" },
      target: { type: DataTypes.INTEGER, allowNull: true },
      manualCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      canceled: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      createdAt: { type: DataTypes.DATE(6), allowNull: false },
      updatedAt: { type: DataTypes.DATE(6), allowNull: false }
    });
    await queryInterface.sequelize.query(`CREATE UNIQUE INDEX IF NOT EXISTS "goal_polos_unique" ON "GoalPolos" ("goalId", "poloId")`);
  },
  down: async (queryInterface: QueryInterface) => {
    await queryInterface.dropTable("GoalPolos");
    await queryInterface.removeColumn("Goals", "workDays");
  }
};
