import { QueryInterface, DataTypes } from "sequelize";

// A proposal "avulsa" says who takes the lead in the CRM when it is generated (link or PDF): by default who made it; the consultant may
// choose a colleague (the proposal was for a friend of theirs).
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const table: any = await queryInterface.describeTable("Proposals");
    if (!table.recipientOwnerId) {
      await queryInterface.addColumn("Proposals", "recipientOwnerId", {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "Users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL"
      });
    }
  },
  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("Proposals", "recipientOwnerId");
  }
};
