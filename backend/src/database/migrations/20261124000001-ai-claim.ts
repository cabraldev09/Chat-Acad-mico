import { QueryInterface, DataTypes } from "sequelize";

// Two servers running at the same time (a rolling deploy, a second instance) must not answer the same conversation twice: whoever writes
// this mark first (an atomic update) is the one that talks; the mark expires by itself if that server dies.
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.addColumn("Tickets", "aiClaimAt", { type: DataTypes.DATE(6), allowNull: true });
  },
  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("Tickets", "aiClaimAt");
  }
};
