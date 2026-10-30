import { QueryInterface, DataTypes } from "sequelize";

// Who changed the line of a polo last (with updatedAt, when): what the administration typed stays registered
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const columns = await queryInterface.describeTable("GoalPolos");
    if (!("updatedById" in columns)) await queryInterface.addColumn("GoalPolos", "updatedById", { type: DataTypes.INTEGER, allowNull: true });
  },
  down: async (queryInterface: QueryInterface) => {
    const columns = await queryInterface.describeTable("GoalPolos");
    if ("updatedById" in columns) await queryInterface.removeColumn("GoalPolos", "updatedById");
  }
};
