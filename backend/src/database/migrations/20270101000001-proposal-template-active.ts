import { QueryInterface, DataTypes } from "sequelize";

// A proposal model can be turned off without deleting it: an inactive model is not offered in new proposals, and the proposals already
// made with it keep their numbers.
module.exports = {
  up: async (q: QueryInterface) => {
    const t = (await q.describeTable("ProposalTemplates")) as any;
    if (!t.active) await q.addColumn("ProposalTemplates", "active", { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true });
  },
  down: async (q: QueryInterface) => {
    await q.removeColumn("ProposalTemplates", "active");
  }
};
