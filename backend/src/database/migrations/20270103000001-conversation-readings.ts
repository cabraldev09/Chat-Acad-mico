import { QueryInterface, DataTypes } from "sequelize";

// THE READINGS OF CONVERSATIONS (services/ReadingServices): one row per conversation to be read by a cheap model, either by the system's own
// AI or by an outside worker (OpenBot) through the API v1. The conversation text is never stored here: it is built, masked, when it is read.
//  - kind "importacao": a conversation copied from the phone of a consultant's own number (is it a lead, did it enroll, why did it stop)
//  - kind "resultado": a conversation that ended in an enrollment, a loss or silence (what sold, what was missing, why it was lost)
//  - kind "revisao": the daily review of a consultant's conversation (see AnalyticsServices/ConsultantReview)
// Leads.recovery*: the leads to try again ("Recuperação" in the CRM): the reason and the objection, and whether it is still open.
module.exports = {
  up: async (q: QueryInterface) => {
    await q.createTable("ConversationReadings", {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      kind: { type: DataTypes.STRING(20), allowNull: false },
      ref: { type: DataTypes.STRING(60), allowNull: false },
      ticketId: { type: DataTypes.INTEGER, allowNull: true, references: { model: "Tickets", key: "id" }, onUpdate: "CASCADE", onDelete: "CASCADE" },
      leadId: { type: DataTypes.INTEGER, allowNull: true, references: { model: "Leads", key: "id" }, onUpdate: "CASCADE", onDelete: "SET NULL" },
      userId: { type: DataTypes.INTEGER, allowNull: true },
      poloId: { type: DataTypes.INTEGER, allowNull: true },
      status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: "pendente" },
      claimedBy: { type: DataTypes.STRING(40), allowNull: true },
      claimedUntil: { type: DataTypes.DATE, allowNull: true },
      doneBy: { type: DataTypes.STRING(20), allowNull: true },
      doneAt: { type: DataTypes.DATE, allowNull: true },
      attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      result: { type: DataTypes.TEXT, allowNull: true },
      error: { type: DataTypes.STRING(200), allowNull: true },
      model: { type: DataTypes.STRING(60), allowNull: true },
      tokens: { type: DataTypes.INTEGER, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false }
    });
    await q.addIndex("ConversationReadings", ["kind", "ticketId", "ref"], { unique: true, name: "conversation_readings_once" });
    await q.addIndex("ConversationReadings", ["status", "kind"], { name: "conversation_readings_status" });
    await q.addIndex("ConversationReadings", ["leadId"], { name: "conversation_readings_lead" });
    const cols: any = await q.describeTable("Leads");
    if (!cols.recoveryState) await q.addColumn("Leads", "recoveryState", { type: DataTypes.STRING(20), allowNull: true });
    if (!cols.recoveryAt) await q.addColumn("Leads", "recoveryAt", { type: DataTypes.DATE, allowNull: true });
    if (!cols.recoveryReason) await q.addColumn("Leads", "recoveryReason", { type: DataTypes.STRING(160), allowNull: true });
    if (!cols.recoveryObjection) await q.addColumn("Leads", "recoveryObjection", { type: DataTypes.STRING(20), allowNull: true });
    await q.addIndex("Leads", ["recoveryState"], { name: "leads_recovery_state" });
  },
  down: async (q: QueryInterface) => {
    await q.removeIndex("Leads", "leads_recovery_state");
    await q.removeColumn("Leads", "recoveryObjection");
    await q.removeColumn("Leads", "recoveryReason");
    await q.removeColumn("Leads", "recoveryAt");
    await q.removeColumn("Leads", "recoveryState");
    await q.dropTable("ConversationReadings");
  }
};
