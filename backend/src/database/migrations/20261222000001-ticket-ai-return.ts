import { QueryInterface, DataTypes } from "sequelize";

// the consultant who handed the lead to the AI to qualify: when the AI finishes (or the consultant takes it back), the conversation
// returns to this person, not to the distribution
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.addColumn("Tickets", "aiReturnUserId", { type: DataTypes.INTEGER, allowNull: true, references: { model: "Users", key: "id" }, onDelete: "SET NULL", onUpdate: "CASCADE" });
  },
  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("Tickets", "aiReturnUserId");
  }
};
