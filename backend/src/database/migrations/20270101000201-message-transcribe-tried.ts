import { QueryInterface, DataTypes } from "sequelize";

// When the transcription of a voice note was tried (services/AiServices/HumanTranscription): a voice note is sent to the transcription
// once, even when it had no speech or failed, so the same audio is never paid twice. A nullable column with no default is added without
// rewriting the table.
module.exports = {
  up: async (q: QueryInterface) => {
    await q.addColumn("Messages", "transcribeTriedAt", { type: DataTypes.DATE, allowNull: true });
  },
  down: async (q: QueryInterface) => {
    await q.removeColumn("Messages", "transcribeTriedAt");
  }
};
