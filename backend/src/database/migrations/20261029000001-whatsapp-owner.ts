import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    // the person who connected this number (null = shared number managed by the administrator)
    await queryInterface.addColumn("Whatsapps", "ownerId", {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: "Users", key: "id" },
      onUpdate: "CASCADE",
      onDelete: "SET NULL"
    });
  },
  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("Whatsapps", "ownerId");
  }
};
