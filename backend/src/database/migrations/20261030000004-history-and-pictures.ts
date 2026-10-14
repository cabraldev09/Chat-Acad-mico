import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    // last time we looked for this person's profile picture (people without one are checked again only now and then)
    await queryInterface.addColumn("Contacts", "picCheckedAt", { type: DataTypes.DATE, allowNull: true });
    // when the existing conversations of this number were copied into the system
    await queryInterface.addColumn("Whatsapps", "historyImportedAt", { type: DataTypes.DATE, allowNull: true });
  },
  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("Contacts", "picCheckedAt");
    await queryInterface.removeColumn("Whatsapps", "historyImportedAt");
  }
};
