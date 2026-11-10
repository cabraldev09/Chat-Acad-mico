import { QueryInterface, DataTypes } from "sequelize";

// "Esqueci minha senha": only the hash of the link's token is kept; it expires and works once.
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.createTable("PasswordResets", {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      userId: { type: DataTypes.INTEGER, allowNull: false, references: { model: "Users", key: "id" }, onDelete: "CASCADE", onUpdate: "CASCADE" },
      tokenHash: { type: DataTypes.STRING(64), allowNull: false },
      expiresAt: { type: DataTypes.DATE(6), allowNull: false },
      usedAt: { type: DataTypes.DATE(6), allowNull: true },
      requestIp: { type: DataTypes.STRING(64), allowNull: true },
      createdAt: { type: DataTypes.DATE(6), allowNull: false },
      updatedAt: { type: DataTypes.DATE(6), allowNull: false }
    });
    await queryInterface.addIndex("PasswordResets", ["tokenHash"], { unique: true });
    await queryInterface.addIndex("PasswordResets", ["userId", "createdAt"]);
  },
  down: async (queryInterface: QueryInterface) => {
    await queryInterface.dropTable("PasswordResets");
  }
};
