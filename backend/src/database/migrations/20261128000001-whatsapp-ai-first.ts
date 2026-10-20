import { QueryInterface, DataTypes } from "sequelize";

// A personal number sends every conversation straight to its owner (the robots stay out). With this on, the number is also an attendance
// number: the AI agent answers the new conversations first and the owner follows (or steps in) like everyone else.
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.addColumn("Whatsapps", "aiFirst", { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false });
  },
  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("Whatsapps", "aiFirst");
  }
};
