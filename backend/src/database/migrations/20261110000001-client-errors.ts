import { QueryInterface, DataTypes } from "sequelize";

// Screens that failed to draw in someone's browser. The container logs vanish at every deploy; this stays.
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.createTable("ClientErrors", {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      code: { type: DataTypes.STRING(20), allowNull: false },
      userId: { type: DataTypes.INTEGER, allowNull: true },
      role: { type: DataTypes.STRING(30), allowNull: true },
      route: { type: DataTypes.STRING(200), allowNull: true },
      message: { type: DataTypes.TEXT, allowNull: true },
      stack: { type: DataTypes.TEXT, allowNull: true },
      components: { type: DataTypes.TEXT, allowNull: true },
      userAgent: { type: DataTypes.STRING(300), allowNull: true },
      createdAt: { type: DataTypes.DATE(6), allowNull: false },
      updatedAt: { type: DataTypes.DATE(6), allowNull: false }
    });
    await queryInterface.addIndex("ClientErrors", ["code"]);
    await queryInterface.addIndex("ClientErrors", ["createdAt"]);
  },
  down: async (queryInterface: QueryInterface) => {
    await queryInterface.dropTable("ClientErrors");
  }
};
