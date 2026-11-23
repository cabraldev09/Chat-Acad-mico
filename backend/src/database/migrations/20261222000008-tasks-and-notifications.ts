import { QueryInterface, DataTypes } from "sequelize";

// Tasks that know what they are (kind), which conversation they belong to, their priority, who created them and why they closed; and the
// notification center (each person's notices, read or not), so an alert is no longer lost when the person is not on the screen.
module.exports = {
  up: async (q: QueryInterface) => {
    await q.sequelize.transaction(async transaction => {
      const o = { transaction };
      await q.addColumn("LeadTasks", "kind", { type: DataTypes.STRING(30), allowNull: false, defaultValue: "manual" }, o);
      await q.addColumn("LeadTasks", "priority", { type: DataTypes.STRING(10), allowNull: false, defaultValue: "normal" }, o);
      await q.addColumn("LeadTasks", "ticketId", { type: DataTypes.INTEGER, allowNull: true, references: { model: "Tickets", key: "id" }, onDelete: "SET NULL", onUpdate: "CASCADE" }, o);
      await q.addColumn("LeadTasks", "createdById", { type: DataTypes.INTEGER, allowNull: true, references: { model: "Users", key: "id" }, onDelete: "SET NULL", onUpdate: "CASCADE" }, o);
      await q.addColumn("LeadTasks", "closedReason", { type: DataTypes.STRING(40), allowNull: true }, o);
      await q.addIndex("LeadTasks", ["leadId", "kind"], { name: "lead_tasks_lead_kind", ...o });
      // what the existing automatic tasks are, from their fixed titles
      const kinds: Array<[string, string]> = [
        ["handoff", "title = 'Atender lead encaminhado pelo agente de IA'"],
        ["transcript", "title = 'Aguardar histórico acadêmico'"],
        ["proposal", "title = 'Gerar e apresentar proposta'"],
        ["billet", "title LIKE 'Enviar o boleto%'"],
        ["onboarding", "title LIKE 'Ambientar%'"],
        ["onboarding_late", "title LIKE 'Ambientação atrasada%'"],
        ["followup", "\"automationKey\" IS NOT NULL"],
        ["nps", "title LIKE 'Falar com o aluno que deu nota%'"],
        ["retention", "title LIKE 'Retenção:%' OR title LIKE 'Rematrícula%'"]
      ];
      for (const [kind, where] of kinds) {
        // eslint-disable-next-line no-await-in-loop
        await q.sequelize.query(`UPDATE "LeadTasks" SET kind = '${kind}' WHERE kind = 'manual' AND (${where})`, o);
      }
      // the handoff task is urgent by nature
      await q.sequelize.query(`UPDATE "LeadTasks" SET priority = 'high' WHERE kind IN ('handoff', 'onboarding_late')`, o);
      await q.createTable("Notifications", {
        id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        userId: { type: DataTypes.INTEGER, allowNull: false, references: { model: "Users", key: "id" }, onDelete: "CASCADE", onUpdate: "CASCADE" },
        kind: { type: DataTypes.STRING(40), allowNull: false },
        level: { type: DataTypes.STRING(10), allowNull: false, defaultValue: "info" },
        title: { type: DataTypes.STRING(160), allowNull: false },
        body: { type: DataTypes.STRING(400), allowNull: true },
        link: { type: DataTypes.STRING(200), allowNull: true },
        dedupeKey: { type: DataTypes.STRING(160), allowNull: true },
        readAt: { type: DataTypes.DATE, allowNull: true },
        createdAt: { type: DataTypes.DATE, allowNull: false },
        updatedAt: { type: DataTypes.DATE, allowNull: false }
      }, o);
      await q.addIndex("Notifications", ["userId", "readAt", "createdAt"], { name: "notifications_user_read", ...o });
      await q.addIndex("Notifications", ["userId", "dedupeKey"], { name: "notifications_user_dedupe", unique: true, ...o });
    });
  },
  down: async (q: QueryInterface) => {
    await q.dropTable("Notifications");
    for (const c of ["closedReason", "createdById", "ticketId", "priority", "kind"]) {
      // eslint-disable-next-line no-await-in-loop
      await q.removeColumn("LeadTasks", c);
    }
  }
};
