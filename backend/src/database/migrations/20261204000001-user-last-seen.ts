import { QueryInterface, DataTypes } from "sequelize";

// The last time a person used the system (any authenticated request, written at most once a minute): "online" and "last access" in the team view.
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.addColumn("Users", "lastSeenAt", { type: DataTypes.DATE, allowNull: true });
  },
  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("Users", "lastSeenAt");
  }
};
