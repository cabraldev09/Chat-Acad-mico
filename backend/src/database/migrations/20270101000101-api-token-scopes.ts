import { DataTypes, QueryInterface } from "sequelize";

// API v1 tokens with scopes, polos, validity and kept only as a hash (SHA-256). The plain `token` column stays nullable for the step that
// turns the existing tokens into hashes (20270101000102); after it nothing is written there again.
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.addColumn("ApiTokens", "tokenHash", { type: DataTypes.STRING(64), allowNull: true, unique: true });
    // the first characters of the token, to recognize it on the screen ("wt_1a2b3c…")
    await queryInterface.addColumn("ApiTokens", "tokenPrefix", { type: DataTypes.STRING(16), allowNull: true });
    // JSON array of scopes ("leads:read", "messages:send"…); ["*"] = full access (the tokens made before scopes existed)
    await queryInterface.addColumn("ApiTokens", "scopes", { type: DataTypes.TEXT, allowNull: true });
    // JSON array of polo ids the token reads; null = every polo
    await queryInterface.addColumn("ApiTokens", "poloIds", { type: DataTypes.TEXT, allowNull: true });
    await queryInterface.addColumn("ApiTokens", "expiresAt", { type: DataTypes.DATE, allowNull: true });
    // made before scopes existed: full access kept so no integration breaks; the screen marks it as "antigo"
    await queryInterface.addColumn("ApiTokens", "legacy", { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false });
    await queryInterface.addColumn("ApiTokens", "createdById", { type: DataTypes.INTEGER, allowNull: true });
    await queryInterface.changeColumn("ApiTokens", "token", { type: DataTypes.STRING, allowNull: true });
  },
  // the hashes cannot become tokens again: after going back, the tokens must be created again
  down: async (queryInterface: QueryInterface) => {
    for (const col of ["tokenHash", "tokenPrefix", "scopes", "poloIds", "expiresAt", "legacy", "createdById"]) {
      // eslint-disable-next-line no-await-in-loop
      await queryInterface.removeColumn("ApiTokens", col);
    }
  }
};
