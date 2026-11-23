import { QueryInterface, DataTypes } from "sequelize";

// What a voice note said, written down once: the AI reads it in every turn after (it does not forget what was said in an audio) and the
// summary of the conversation keeps it. A nullable column with no default is added without rewriting the table.
module.exports = {
  up: async (q: QueryInterface) => {
    await q.addColumn("Messages", "transcript", { type: DataTypes.TEXT, allowNull: true });
  },
  down: async (q: QueryInterface) => {
    await q.removeColumn("Messages", "transcript");
  }
};
