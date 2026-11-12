import { QueryInterface, DataTypes } from "sequelize";

// What each number is for: "atendimento" (consultants) or "tutoria" (tutors). Each side keeps its own conversations and history.
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.addColumn("Whatsapps", "team", { type: DataTypes.STRING(20), allowNull: true });
  },
  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("Whatsapps", "team");
  }
};
