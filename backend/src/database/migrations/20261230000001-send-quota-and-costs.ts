import { QueryInterface, DataTypes } from "sequelize";

// Sends per person and what each person spent:
// - Campaigns.objective: what the send is for (asked on every new campaign and notice);
// - SendReleases: a person asks the management for more messages in the month, the management approves or denies;
// - OutboundDeliveries.userId and AiUsage.userId: who caused each Meta message and each AI call (empty: automation).
// The past Meta messages get their person back from the key of the send (outbound:<id> → the message's author, campaign:<id> → the
// campaign's creator, schedule:<id> → who scheduled it). The past AI calls stay as automation: nothing tells who asked for them.
module.exports = {
  up: async (q: QueryInterface) => {
    const camp = (await q.describeTable("Campaigns")) as any;
    if (!camp.objective) await q.addColumn("Campaigns", "objective", { type: DataTypes.TEXT, allowNull: true });
    await q.createTable("SendReleases", {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      userId: { type: DataTypes.INTEGER, allowNull: false, references: { model: "Users", key: "id" }, onUpdate: "CASCADE", onDelete: "CASCADE" },
      month: { type: DataTypes.STRING(7), allowNull: false },
      requested: { type: DataTypes.INTEGER, allowNull: false },
      reason: { type: DataTypes.TEXT, allowNull: false },
      context: { type: DataTypes.JSONB, allowNull: true },
      status: { type: DataTypes.STRING(10), allowNull: false, defaultValue: "pending" },
      granted: { type: DataTypes.INTEGER, allowNull: true },
      decidedBy: { type: DataTypes.INTEGER, allowNull: true, references: { model: "Users", key: "id" }, onUpdate: "CASCADE", onDelete: "SET NULL" },
      decidedAt: { type: DataTypes.DATE, allowNull: true },
      decisionNote: { type: DataTypes.STRING(300), allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false }
    });
    await q.addIndex("SendReleases", ["userId", "month"], { name: "send_releases_user_month" });
    await q.addIndex("SendReleases", ["status"], { name: "send_releases_status" });
    const out = (await q.describeTable("OutboundDeliveries")) as any;
    if (!out.userId) await q.addColumn("OutboundDeliveries", "userId", { type: DataTypes.INTEGER, allowNull: true });
    await q.addIndex("OutboundDeliveries", ["userId", "createdAt"], { name: "outbound_deliveries_user_created" });
    const ai = (await q.describeTable("AiUsage")) as any;
    if (!ai.userId) await q.addColumn("AiUsage", "userId", { type: DataTypes.INTEGER, allowNull: true });
    await q.addIndex("AiUsage", ["userId", "createdAt"], { name: "ai_usage_user_created" });
    if (q.sequelize.getDialect() !== "postgres") return;
    const ref = (prefix: string) => `CASE WHEN split_part(d."key", ':', 2) ~ '^[0-9]+$' AND d."key" LIKE '${prefix}:%' THEN split_part(d."key", ':', 2)::int END`;
    await q.sequelize.query(`UPDATE "OutboundDeliveries" d SET "userId" = o."userId" FROM "OutboundMessages" o WHERE d."userId" IS NULL AND o.id = ${ref("outbound")}`);
    await q.sequelize.query(`UPDATE "OutboundDeliveries" d SET "userId" = c."createdById" FROM "Campaigns" c WHERE d."userId" IS NULL AND c.id = ${ref("campaign")}`);
    await q.sequelize.query(`UPDATE "OutboundDeliveries" d SET "userId" = s."userId" FROM "Schedules" s WHERE d."userId" IS NULL AND s.id = ${ref("schedule")}`);
  },
  down: async (q: QueryInterface) => {
    await q.removeColumn("AiUsage", "userId");
    await q.removeColumn("OutboundDeliveries", "userId");
    await q.dropTable("SendReleases");
    await q.removeColumn("Campaigns", "objective");
  }
};
