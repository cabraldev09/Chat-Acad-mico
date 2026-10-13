import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    // "off" ignores every WhatsApp group, "selected" only the listed ones, "all" everything
    await queryInterface.addColumn("Whatsapps", "groupsMode", {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "off"
    });
    // JSON array of group ids (the number part of 1203…@g.us)
    await queryInterface.addColumn("Whatsapps", "allowedGroups", { type: DataTypes.TEXT, allowNull: true });
  },
  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("Whatsapps", "allowedGroups");
    await queryInterface.removeColumn("Whatsapps", "groupsMode");
  }
};
