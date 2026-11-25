import { DataTypes, QueryInterface } from "sequelize";

// The course levels a proposal model is for (JSON list, e.g. ["Pós-graduação"]); empty = any level. The automatic choice of the model
// uses it, so a graduation course of the Cruzeiro does not get the model of its graduate courses. The three models created by the
// previous migration get their levels when the management has not set any.
const LEVELS: Record<string, string[]> = {
  "Pós-graduação Cruzeiro": ["Pós-graduação", "MBA"],
  "SESTED: técnicos e pós": ["Técnico", "Técnico regular", "Técnico por competência", "Pós-graduação", "MBA"],
  "SESTED: profissionalizante": ["Profissionalizante"]
};

module.exports = {
  up: async (q: QueryInterface) => {
    await q.addColumn("ProposalTemplates", "courseLevels", { type: DataTypes.TEXT, allowNull: true });
    for (const [name, levels] of Object.entries(LEVELS)) {
      // eslint-disable-next-line no-await-in-loop
      await q.sequelize.query(`UPDATE "ProposalTemplates" SET "courseLevels" = :levels WHERE name = :name AND "courseLevels" IS NULL`, {
        replacements: { name, levels: JSON.stringify(levels) }
      });
    }
  },
  down: async (q: QueryInterface) => {
    await q.removeColumn("ProposalTemplates", "courseLevels");
  }
};
