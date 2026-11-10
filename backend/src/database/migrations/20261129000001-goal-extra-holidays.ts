import { QueryInterface, DataTypes } from "sequelize";

// Days without work that the company adds to the calendar of a period of goals (a municipal holiday, a recess): a JSON list of YYYY-MM-DD.
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.addColumn("Goals", "extraHolidays", { type: DataTypes.TEXT, allowNull: true });
  },
  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("Goals", "extraHolidays");
  }
};
