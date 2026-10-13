import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    // "strict" keeps unofficial (QR code) connections inside safe sending limits
    await queryInterface.addColumn("Whatsapps", "riskMode", {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "strict"
    });
    await queryInterface.addColumn("Whatsapps", "connectedSince", {
      type: DataTypes.DATE(6),
      allowNull: true
    });
    await queryInterface.addColumn("Contacts", "optOut", {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    });
    await queryInterface.addColumn("Contacts", "optOutAt", {
      type: DataTypes.DATE(6),
      allowNull: true
    });
    await queryInterface.addColumn("Campaigns", "pauseReason", {
      type: DataTypes.STRING,
      allowNull: true
    });
  },
  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("Campaigns", "pauseReason");
    await queryInterface.removeColumn("Contacts", "optOutAt");
    await queryInterface.removeColumn("Contacts", "optOut");
    await queryInterface.removeColumn("Whatsapps", "connectedSince");
    await queryInterface.removeColumn("Whatsapps", "riskMode");
  }
};
