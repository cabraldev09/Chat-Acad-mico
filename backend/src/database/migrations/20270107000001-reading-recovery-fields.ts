import { DataTypes, QueryInterface } from "sequelize";

// What the reading of the copied conversations keeps for each lead: where the sale stopped, what was left pending, what could have been
// better in the service; and, for who seems enrolled, the RGM, the day and the polo the conversation shows (only suggestions: a person
// confirms the enrollment). The readings that failed because their "next step" did not fit a 40-character column go back to the queue.
module.exports = {
  up: async (q: QueryInterface) => {
    const cols = (await q.describeTable("Leads")) as any;
    if (!cols.recoveryStage) await q.addColumn("Leads", "recoveryStage", { type: DataTypes.STRING(160), allowNull: true });
    if (!cols.recoveryPending) await q.addColumn("Leads", "recoveryPending", { type: DataTypes.TEXT, allowNull: true });
    if (!cols.serviceTip) await q.addColumn("Leads", "serviceTip", { type: DataTypes.TEXT, allowNull: true });
    if (!cols.rgmSuggested) await q.addColumn("Leads", "rgmSuggested", { type: DataTypes.STRING(40), allowNull: true });
    if (!cols.enrolledAtSuggested) await q.addColumn("Leads", "enrolledAtSuggested", { type: DataTypes.DATE, allowNull: true });
    await q.sequelize.query(
      `UPDATE "ConversationReadings" SET status = 'pendente', attempts = 0, error = NULL, "claimedBy" = NULL, "claimedUntil" = NULL
        WHERE kind = 'importacao' AND status IN ('pendente', 'falhou') AND error LIKE '%value too long%'`
    );
  },
  down: async (q: QueryInterface) => {
    for (const c of ["enrolledAtSuggested", "rgmSuggested", "serviceTip", "recoveryPending", "recoveryStage"]) await q.removeColumn("Leads", c); // eslint-disable-line no-await-in-loop
  }
};
