import { QueryInterface, DataTypes } from "sequelize";

// Affiliates also have a link in the "Minhas indicações" app (another platform): the consultant keeps it here,
// so it is never lost and can be sent whenever a referral is needed.
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.addColumn("Affiliates", "externalLink", { type: DataTypes.TEXT, allowNull: true });
  },
  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("Affiliates", "externalLink");
  }
};
