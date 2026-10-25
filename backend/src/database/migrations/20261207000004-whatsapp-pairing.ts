import { QueryInterface, DataTypes } from "sequelize";

// Connect a WhatsApp number with the pairing code (typed on the phone) instead of the QR Code: no second device needed.
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const table = (await queryInterface.describeTable("Whatsapps")) as Record<string, unknown>;
    if (!table.pairingPhone) await queryInterface.addColumn("Whatsapps", "pairingPhone", { type: DataTypes.STRING(20), allowNull: true });
  },
  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("Whatsapps", "pairingPhone");
  }
};
