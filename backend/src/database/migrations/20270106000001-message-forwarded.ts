import { QueryInterface, DataTypes } from "sequelize";

// A message forwarded on WhatsApp says so ("Encaminhada"), as on the phone.
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const table: any = await queryInterface.describeTable("Messages");
    if (!table.isForwarded) {
      await queryInterface.addColumn("Messages", "isForwarded", { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false });
    }
  },
  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("Messages", "isForwarded");
  }
};
