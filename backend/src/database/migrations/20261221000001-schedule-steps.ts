import { QueryInterface, DataTypes } from "sequelize";

// a scheduled message can be a short sequence (like a campaign): the messages and how many already went out
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.addColumn("Schedules", "steps", { type: DataTypes.JSON, allowNull: true });
    await queryInterface.addColumn("Schedules", "stepsDone", { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 });
  },
  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("Schedules", "stepsDone");
    await queryInterface.removeColumn("Schedules", "steps");
  }
};
