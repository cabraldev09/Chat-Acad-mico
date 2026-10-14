import { fn, col, Op } from "sequelize";

import AffiliateBonus from "../../models/AffiliateBonus";
import Lead from "../../models/Lead";
import Proposal from "../../models/Proposal";

export interface AffiliateStats {
  referrals: number;
  proposals: number;
  proposalsViewed: number;
  enrolled: number;
  conversion: number;
  bonusPending: number;
  bonusApproved: number;
  bonusPaid: number;
}

const empty = (): AffiliateStats => ({
  referrals: 0, proposals: 0, proposalsViewed: 0, enrolled: 0, conversion: 0, bonusPending: 0, bonusApproved: 0, bonusPaid: 0
});

// Production of each affiliate: people referred, proposals made, enrolments and what is owed. `since` limits the period.
export const statsFor = async (ids: number[], since?: Date): Promise<Map<number, AffiliateStats>> => {
  const out = new Map<number, AffiliateStats>();
  ids.forEach(id => out.set(id, empty()));
  if (!ids.length) return out;
  const period: any = since ? { createdAt: { [Op.gte]: since } } : {};

  const leads: any[] = await Lead.findAll({
    attributes: ["affiliateId", [fn("COUNT", col("id")), "n"], [fn("COUNT", col("wonAt")), "won"]],
    where: { affiliateId: { [Op.in]: ids }, ...period },
    group: ["affiliateId"],
    raw: true
  });
  leads.forEach(r => {
    const s = out.get(Number(r.affiliateId))!;
    s.referrals = Number(r.n);
    s.enrolled = Number(r.won);
  });

  const proposals: any[] = await Proposal.findAll({
    attributes: ["affiliateId", [fn("COUNT", col("id")), "n"], [fn("COUNT", col("viewedAt")), "viewed"]],
    where: { affiliateId: { [Op.in]: ids }, ...period },
    group: ["affiliateId"],
    raw: true
  });
  proposals.forEach(r => {
    const s = out.get(Number(r.affiliateId))!;
    s.proposals = Number(r.n);
    s.proposalsViewed = Number(r.viewed);
  });

  const bonuses: any[] = await AffiliateBonus.findAll({
    attributes: ["affiliateId", "status", [fn("SUM", col("amount")), "total"]],
    where: { affiliateId: { [Op.in]: ids }, status: { [Op.ne]: "cancelled" }, ...period },
    group: ["affiliateId", "status"],
    raw: true
  });
  bonuses.forEach(r => {
    const s = out.get(Number(r.affiliateId))!;
    const v = Number(r.total) || 0;
    if (r.status === "pending") s.bonusPending = v;
    else if (r.status === "approved") s.bonusApproved = v;
    else if (r.status === "paid") s.bonusPaid = v;
  });

  out.forEach(s => {
    s.conversion = s.referrals ? Math.round((s.enrolled / s.referrals) * 1000) / 10 : 0;
  });
  return out;
};
