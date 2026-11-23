import { QueryInterface, DataTypes } from "sequelize";

// How the polo of a lead was decided: "city" (the city or state the person told, adjusted by the course), "wallet" (no city was told: the
// polo of the consultant who owns the lead), "flow" (the person chose it inside a flow) or "enrollment". The city always beats the wallet,
// so the source has to be known. What already exists is marked as it was decided until now: by the enrollment or by the city.
module.exports = {
  up: async (q: QueryInterface) => {
    const cols = await q.describeTable("Leads");
    if (!(cols as any).poloSource) await q.addColumn("Leads", "poloSource", { type: DataTypes.STRING(20), allowNull: true });
    await q.sequelize.query(`UPDATE "Leads" SET "poloSource" = CASE WHEN "enrolledAt" IS NOT NULL THEN 'enrollment' ELSE 'city' END WHERE "poloId" IS NOT NULL AND "poloSource" IS NULL`);
  },
  down: async (q: QueryInterface) => {
    await q.removeColumn("Leads", "poloSource");
  }
};
