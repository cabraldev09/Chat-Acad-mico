import { QueryInterface, DataTypes } from "sequelize";

// who created each campaign and contact list: the tutor sees and sends only their own (to their own students)
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.addColumn("Campaigns", "createdById", { type: DataTypes.INTEGER, allowNull: true });
    await queryInterface.addColumn("ContactLists", "createdById", { type: DataTypes.INTEGER, allowNull: true });
  },
  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("ContactLists", "createdById");
    await queryInterface.removeColumn("Campaigns", "createdById");
  }
};
