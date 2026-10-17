import { QueryInterface, DataTypes } from "sequelize";

// What the institution spent to attract students, month by month, by source (Google, Instagram...) and, when it is
// known, by campaign: the base of the cost per lead and of the cost per enrollment (CAC).
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.createTable("MarketingSpends", {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      month: { type: DataTypes.STRING(7), allowNull: false },
      source: { type: DataTypes.STRING(80), allowNull: false },
      campaign: { type: DataTypes.STRING(120), allowNull: true },
      amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
      note: { type: DataTypes.TEXT, allowNull: true },
      createdBy: { type: DataTypes.INTEGER, allowNull: true },
      createdAt: { type: DataTypes.DATE(6), allowNull: false },
      updatedAt: { type: DataTypes.DATE(6), allowNull: false }
    });
    await queryInterface.addIndex("MarketingSpends", ["month", "source"]);
  },
  down: async (queryInterface: QueryInterface) => {
    await queryInterface.dropTable("MarketingSpends");
  }
};
