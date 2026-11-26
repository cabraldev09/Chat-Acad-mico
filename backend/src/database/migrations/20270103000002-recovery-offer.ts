import { QueryInterface, DataTypes } from "sequelize";

// THE RECOVERY CAMPAIGN (services/CampaignServices/Offer): the offer the management set for the send (JSON: the monthly fee, fixed or a
// scholarship over the course's price; the enrollment fee or exempt; the start; until when it holds) and what happens when the person
// answers (approach: "ia" = the AI of the official number talks with the offer and passes to the consultant; "proposta" = the system makes
// the proposal with the offer and sends it; "consultor" = the consultant takes it). Proposals.validUntil: the last day the proposal holds.
module.exports = {
  up: async (q: QueryInterface) => {
    const camp: any = await q.describeTable("Campaigns");
    if (!camp.offer) await q.addColumn("Campaigns", "offer", { type: DataTypes.TEXT, allowNull: true });
    if (!camp.approach) await q.addColumn("Campaigns", "approach", { type: DataTypes.STRING(20), allowNull: true });
    const prop: any = await q.describeTable("Proposals");
    if (!prop.validUntil) await q.addColumn("Proposals", "validUntil", { type: DataTypes.DATEONLY, allowNull: true });
  },
  down: async (q: QueryInterface) => {
    await q.removeColumn("Proposals", "validUntil");
    await q.removeColumn("Campaigns", "approach");
    await q.removeColumn("Campaigns", "offer");
  }
};
