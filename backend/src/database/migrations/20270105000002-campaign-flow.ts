import { DataTypes, QueryInterface } from "sequelize";

// The bot of a campaign: who answers the campaign goes into this flow (it qualifies them and passes them to a consultant).
module.exports = {
  up: async (q: QueryInterface) => {
    const cols = (await q.describeTable("Campaigns")) as any;
    if (!cols.flowId) await q.addColumn("Campaigns", "flowId", { type: DataTypes.INTEGER, allowNull: true, references: { model: "ChatFlows", key: "id" }, onUpdate: "CASCADE", onDelete: "SET NULL" });
  },
  down: async (q: QueryInterface) => {
    await q.removeColumn("Campaigns", "flowId");
  }
};
