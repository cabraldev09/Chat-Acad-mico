import { Op } from "sequelize";

import Affiliate from "../../models/Affiliate";
import AffiliateBonus from "../../models/AffiliateBonus";
import AffiliateCampaign from "../../models/AffiliateCampaign";
import Course from "../../models/Course";
import Lead from "../../models/Lead";
import { getSetting } from "../../helpers/AppSettings";
import { brl, inWindow, isVisibleTo, releasedIds } from "../../helpers/Affiliates";
import { getIO } from "../../libs/socket";
import { addActivity } from "../CrmServices/LeadCore";

export const getRules = async () => ({
  mode: (await getSetting("affiliate_bonus_mode", "fixed")) === "pct" ? "pct" : "fixed",
  value: Number(await getSetting("affiliate_bonus_value", "0")) || 0,
  trigger: (await getSetting("affiliate_bonus_trigger", "enrolled")) === "fee_paid" ? "fee_paid" : "enrolled",
  kind: (await getSetting("affiliate_bonus_kind", "bonus")) === "pix" ? "pix" : "bonus"
});

// what an enrolment is worth: the affiliate's own value, else the best running campaign released to them, else the general rule
export const resolveAmount = async (
  aff: Affiliate,
  lead: Lead
): Promise<{ amount: number; reason: string; campaignId: number | null }> => {
  if (aff.bonusValue !== null && aff.bonusValue !== undefined && Number(aff.bonusValue) > 0) {
    return { amount: Number(aff.bonusValue), reason: "Valor combinado com o afiliado", campaignId: null };
  }
  const released = await releasedIds("campaign", aff);
  const campaigns = await AffiliateCampaign.findAll({ where: { active: true, bonusValue: { [Op.gt]: 0 } } });
  const best = campaigns
    .filter(c => inWindow(c) && isVisibleTo(c, released))
    .sort((a, b) => Number(b.bonusValue) - Number(a.bonusValue))[0];
  if (best) return { amount: Number(best.bonusValue), reason: `Campanha: ${best.title}`, campaignId: best.id };

  const rules = await getRules();
  if (rules.mode === "pct") {
    const course = lead.courseId ? await Course.findByPk(lead.courseId) : null;
    const fee = course ? Number(course.monthlyFee) || 0 : 0;
    return {
      amount: Math.round(fee * rules.value) / 100,
      reason: course ? `${rules.value}% da mensalidade de ${course.name}` : "Sem curso definido: confira o valor",
      campaignId: null
    };
  }
  return { amount: rules.value, reason: "Valor padrão por matrícula", campaignId: null };
};

// Idempotent: one line per lead. A cancelled line comes back when the student is enrolled again.
export const recordBonus = async (leadId: number, event: "enrolled" | "fee_paid"): Promise<AffiliateBonus | null> => {
  const lead = await Lead.findByPk(leadId);
  if (!lead || !lead.affiliateId) return null;
  const rules = await getRules();
  if (rules.trigger !== event) return null;
  const aff = await Affiliate.findByPk(lead.affiliateId);
  if (!aff) return null;

  const existing = await AffiliateBonus.findOne({ where: { leadId } });
  if (existing && existing.status !== "cancelled") return existing;

  const worth = await resolveAmount(aff, lead);
  let row: AffiliateBonus;
  if (existing) {
    await existing.update({ status: "pending", amount: worth.amount, reason: worth.reason, campaignId: worth.campaignId, approvedAt: null, approvedBy: null });
    row = existing;
  } else {
    row = await AffiliateBonus.create({
      affiliateId: aff.id,
      leadId,
      campaignId: worth.campaignId,
      kind: rules.kind,
      amount: worth.amount,
      status: "pending",
      reason: worth.reason
    } as any);
  }
  await addActivity(leadId, null, "system", `Matrícula indicada pelo afiliado ${aff.name}: ${brl(worth.amount)} de ${rules.kind === "pix" ? "Pix" : "bonificação"} a pagar`);
  getIO().emit("affiliateBonus", { action: "create", bonusId: row.id, affiliateId: aff.id });
  return row;
};

// the student left "Matriculado": what was not paid yet no longer counts
export const cancelPendingBonus = async (leadId: number): Promise<void> => {
  const [changed] = await AffiliateBonus.update(
    { status: "cancelled", note: "Matrícula desfeita" },
    { where: { leadId, status: { [Op.in]: ["pending", "approved"] } } }
  );
  if (changed) getIO().emit("affiliateBonus", { action: "update", leadId });
};
