import { QueryInterface, DataTypes } from "sequelize";

// What was left pending in the tutoring conversations (a case opened in the institution's system, a return promised, a document asked):
// found by a cheap reading of the AI or written by the tutor, with the protocol number and its name, until it is resolved.
// Tickets.tutoringAuditedMessageId: the last message already read, so a conversation is only read again when something new arrives.
module.exports = {
  up: async (q: QueryInterface) => {
    await q.createTable("TutoringIssues", {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      ticketId: { type: DataTypes.INTEGER, allowNull: true, references: { model: "Tickets", key: "id" }, onUpdate: "CASCADE", onDelete: "SET NULL" },
      leadId: { type: DataTypes.INTEGER, allowNull: true, references: { model: "Leads", key: "id" }, onUpdate: "CASCADE", onDelete: "SET NULL" },
      tutorId: { type: DataTypes.INTEGER, allowNull: true, references: { model: "Users", key: "id" }, onUpdate: "CASCADE", onDelete: "SET NULL" },
      institutionId: { type: DataTypes.INTEGER, allowNull: true },
      kind: { type: DataTypes.STRING(20), allowNull: false, defaultValue: "outro" },
      summary: { type: DataTypes.STRING(300), allowNull: false },
      idea: { type: DataTypes.STRING(300), allowNull: true },
      protocolNumber: { type: DataTypes.STRING(60), allowNull: true },
      protocolName: { type: DataTypes.STRING(160), allowNull: true },
      status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: "aberta" },
      source: { type: DataTypes.STRING(10), allowNull: false, defaultValue: "ia" },
      detectedAt: { type: DataTypes.DATE, allowNull: false },
      resolvedAt: { type: DataTypes.DATE, allowNull: true },
      resolvedBy: { type: DataTypes.INTEGER, allowNull: true },
      lastMessageId: { type: DataTypes.STRING, allowNull: true },
      model: { type: DataTypes.STRING(60), allowNull: true },
      tokens: { type: DataTypes.INTEGER, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false }
    });
    await q.addIndex("TutoringIssues", ["tutorId", "status"], { name: "tutoring_issues_tutor_status" });
    await q.addIndex("TutoringIssues", ["ticketId"], { name: "tutoring_issues_ticket" });
    const cols = await q.describeTable("Tickets");
    if (!(cols as any).tutoringAuditedMessageId) await q.addColumn("Tickets", "tutoringAuditedMessageId", { type: DataTypes.STRING, allowNull: true });
  },
  down: async (q: QueryInterface) => {
    await q.removeColumn("Tickets", "tutoringAuditedMessageId");
    await q.dropTable("TutoringIssues");
  }
};
