import { QueryInterface, DataTypes } from "sequelize";

// Retention of the content of the conversations (off by default; see services/SystemServices/ContentRetention):
// - Messages.mediaPurgedAt: the file of the message was deleted by the policy (the screen says so instead of offering to download it again);
// - Messages.bodyPurgedAt: the text, the transcript and the file of the message were deleted by the policy (the record of the message stays);
// - DataPurgeRuns: every run and every simulation, with how many and when (nothing personal is kept there).
// Nullable columns with no default are added without rewriting the table.
module.exports = {
  up: async (q: QueryInterface) => {
    await q.addColumn("Messages", "mediaPurgedAt", { type: DataTypes.DATE, allowNull: true });
    await q.addColumn("Messages", "bodyPurgedAt", { type: DataTypes.DATE, allowNull: true });
    await q.createTable("DataPurgeRuns", {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      // run (the nightly policy) | simulation (what would go, nothing deleted)
      mode: { type: DataTypes.STRING(20), allowNull: false },
      audioDays: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      conversationDays: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      audioFiles: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      conversations: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      conversationMessages: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      filesDeleted: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      // counts by polo and by type (only numbers and names of polos)
      details: { type: DataTypes.TEXT, allowNull: true },
      error: { type: DataTypes.TEXT, allowNull: true },
      actorId: { type: DataTypes.INTEGER, allowNull: true },
      startedAt: { type: DataTypes.DATE, allowNull: false },
      finishedAt: { type: DataTypes.DATE, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false }
    });
    await q.addIndex("DataPurgeRuns", ["createdAt"], { name: "data_purge_runs_created" });
  },
  down: async (q: QueryInterface) => {
    await q.dropTable("DataPurgeRuns");
    await q.removeColumn("Messages", "bodyPurgedAt");
    await q.removeColumn("Messages", "mediaPurgedAt");
  }
};
