import { DataTypes, QueryInterface } from "sequelize";

// What the lead is looking for: Graduação, Técnico, Técnico por competência or Pós-graduação (the bots of qualification ask it with buttons).
module.exports = {
  up: async (q: QueryInterface) => {
    const cols = (await q.describeTable("Leads")) as any;
    if (!cols.courseLevel) await q.addColumn("Leads", "courseLevel", { type: DataTypes.STRING(40), allowNull: true });
  },
  down: async (q: QueryInterface) => {
    await q.removeColumn("Leads", "courseLevel");
  }
};
