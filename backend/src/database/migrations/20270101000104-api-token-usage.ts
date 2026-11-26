import { DataTypes, QueryInterface } from "sequelize";

// What each API token is used for (helpers/ApiUsage): the routes it calls, how many times and the last time. Only method and route.
module.exports = {
  up: async (q: QueryInterface) => {
    await q.addColumn("ApiTokens", "usage", { type: DataTypes.TEXT, allowNull: true });
  },
  down: async (q: QueryInterface) => {
    await q.removeColumn("ApiTokens", "usage");
  }
};
