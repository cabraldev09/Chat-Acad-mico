import { QueryInterface, DataTypes } from "sequelize";

// Who made each quick answer: a person edits and deletes the ones they made; the management edits all (the older ones have no owner and are the management's).
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.addColumn("QuickAnswers", "userId", { type: DataTypes.INTEGER, allowNull: true });
  },
  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("QuickAnswers", "userId");
  }
};
