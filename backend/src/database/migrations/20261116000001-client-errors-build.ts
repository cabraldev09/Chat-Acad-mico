import { QueryInterface, DataTypes } from "sequelize";

// Which version of the code the person was running (to tell a defect still alive from a tab that was left open on an old
// version) and whether the team already fixed that failure.
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.addColumn("ClientErrors", "build", { type: DataTypes.STRING(20), allowNull: true });
    await queryInterface.addColumn("ClientErrors", "resolvedAt", { type: DataTypes.DATE(6), allowNull: true });
    await queryInterface.addIndex("ClientErrors", ["route"]);
  },
  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeIndex("ClientErrors", ["route"]);
    await queryInterface.removeColumn("ClientErrors", "resolvedAt");
    await queryInterface.removeColumn("ClientErrors", "build");
  }
};
