import { QueryInterface, DataTypes } from "sequelize";

// A proposal "avulsa" (no lead) can keep the CPF and the phone of the person it is for, both optional: they let the team find it again
// (by name or CPF) and say who to contact.
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const table: any = await queryInterface.describeTable("Proposals");
    if (!table.recipientCpf) await queryInterface.addColumn("Proposals", "recipientCpf", { type: DataTypes.STRING(11), allowNull: true });
    if (!table.recipientPhone) await queryInterface.addColumn("Proposals", "recipientPhone", { type: DataTypes.STRING(20), allowNull: true });
  },
  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("Proposals", "recipientPhone");
    await queryInterface.removeColumn("Proposals", "recipientCpf");
  }
};
