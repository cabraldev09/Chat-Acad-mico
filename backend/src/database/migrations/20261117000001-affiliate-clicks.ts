import { QueryInterface, DataTypes } from "sequelize";

// Opens of the referral link of an affiliate (/r/CODE). Only a hash of the visitor is kept (never the address or the
// browser), enough to count each person once a day.
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.createTable("AffiliateClicks", {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      affiliateId: { type: DataTypes.INTEGER, allowNull: false, references: { model: "Affiliates", key: "id" }, onUpdate: "CASCADE", onDelete: "CASCADE" },
      visitor: { type: DataTypes.STRING(64), allowNull: false },
      createdAt: { type: DataTypes.DATE(6), allowNull: false },
      updatedAt: { type: DataTypes.DATE(6), allowNull: false }
    });
    await queryInterface.addIndex("AffiliateClicks", ["affiliateId", "createdAt"]);
  },
  down: async (queryInterface: QueryInterface) => {
    await queryInterface.dropTable("AffiliateClicks");
  }
};
