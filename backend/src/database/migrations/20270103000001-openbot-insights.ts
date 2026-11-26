import { QueryInterface, DataTypes } from "sequelize";

// The channel OpenBot → management (POST /api/v1/insights, scope insights:write): warnings and recommendations of the whole operation,
// without personal data, shown to the administrators in the bell and in the commercial center. The same subject (dedupeKey) lives
// once while it is not dismissed: a partial unique index. Dismissed or expired ones are deleted by the nightly maintenance after 30 days.
module.exports = {
  up: async (q: QueryInterface) => {
    await q.createTable("OpenbotInsights", {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      tokenId: { type: DataTypes.INTEGER, allowNull: true },
      kind: { type: DataTypes.STRING(40), allowNull: false },
      level: { type: DataTypes.STRING(10), allowNull: false, defaultValue: "info" },
      title: { type: DataTypes.STRING(120), allowNull: false },
      body: { type: DataTypes.STRING(400), allowNull: false },
      link: { type: DataTypes.STRING(200), allowNull: true },
      dedupeKey: { type: DataTypes.STRING(160), allowNull: false },
      source: { type: DataTypes.STRING(20), allowNull: false, defaultValue: "OpenBot" },
      expiresAt: { type: DataTypes.DATE, allowNull: false },
      resolvedAt: { type: DataTypes.DATE, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false }
    });
    await q.addIndex("OpenbotInsights", ["dedupeKey"], { name: "openbot_insights_dedupe_live", unique: true, where: { resolvedAt: null } });
    await q.addIndex("OpenbotInsights", ["expiresAt"], { name: "openbot_insights_expires" });
  },
  down: async (q: QueryInterface) => {
    await q.dropTable("OpenbotInsights");
  }
};
