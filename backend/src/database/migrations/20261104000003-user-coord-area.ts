import { QueryInterface, DataTypes } from "sequelize";

// A coordinator manages every polo and sees everything; the area says which side they coordinate
// (comercial | academica). It labels the person and picks their default screens, it does not limit access.
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.addColumn("Users", "coordArea", { type: DataTypes.STRING, allowNull: true });
  },
  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("Users", "coordArea");
  }
};
