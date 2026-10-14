import { Op } from "sequelize";

import Affiliate from "../../models/Affiliate";
import AffiliateBonus from "../../models/AffiliateBonus";
import AffiliateCampaign from "../../models/AffiliateCampaign";
import Course from "../../models/Course";
import Lead from "../../models/Lead";
import Proposal from "../../models/Proposal";
import { getSetting } from "../../helpers/AppSettings";
import { brl, inWindow, isVisibleTo, releasedIds } from "../../helpers/Affiliates";
import { getIO } from "../../libs/socket";
import { addActivity } from "../CrmServices/LeadCore";

// mode: "fixed" (value per enrolment), "pct" (share of the course's monthly fee) or "first_monthly" (the first monthly
// fee of the student's proposal, paid up to `payDays` days after the enrolment is confirmed)
export const getRules = async () => ({
  mode: ((m: string) => (m === "pct" || m === "first_monthly" ? m : "fixed"))(await getSetting("affiliate_bonus_mode", "fixed")),
  payDays: Math.min(365, Math.max(1, Number(await getSetting("affiliate_pay_days", "60")) || 60)),
  value: Number(await getSetting("affiliate_bonus_value", "0")) || 0,
  trigger: (await getSetting("affiliate_bonus_trigger", "enrolled")) === "fee_paid" ? "fee_paid" : "enrolled",
  kind: (await getSetting("affiliate_bonus_kind", "bonus")) === "pix" ? "pix" : "bonus"
});

// texts of the Central do Afiliado (edited by the administration)
export const DEFAULT_FAQ = [
  { q: "Como faço uma indicação?", a: "Use o botão “Indicar alguém” ou compartilhe o seu link pessoal. A pessoa recebe contato da nossa equipe e você acompanha o andamento na aba Indicações." },
  { q: "Quando recebo a minha comissão?", a: "Quando a matrícula é confirmada, a sua bonificação aparece em “Suas bonificações” com a data prevista. O pagamento é feito por Pix ou transferência bancária, em até {{dias}} dias após a confirmação." },
  { q: "Posso alterar as artes ou oferecer condições?", a: "Não. Use as artes e os textos oficiais e não informe valores, bolsas ou condições. Qualquer dúvida da pessoa interessada deve ser encaminhada para a equipe oficial." }
];

export const getPortalTexts = async () => {
  let faq: Array<{ q: string; a: string }> = DEFAULT_FAQ;
  let customFaq = false;
  try {
    const parsed = JSON.parse(await getSetting("affiliate_faq", ""));
    if (Array.isArray(parsed) && parsed.length) faq = parsed.filter((i: any) => i && i.q && i.a).map((i: any) => ({ q: String(i.q), a: String(i.a) }));
    if (Array.isArray(parsed) && parsed.length) customFaq = true;
  } catch (e) { /* default */ }
  const payDays = (await getRules()).payDays;
  faq = faq.map(i => ({ q: i.q, a: i.a.replace(/\{\{dias\}\}/g, String(payDays)) }));
  return {
    faq,
    customFaq,
    payDays,
    videoProgram: await getSetting("affiliate_video_program", ""),
    videoTutorial: await getSetting("affiliate_video_tutorial", ""),
    supportPhone: await getSetting("affiliate_support_phone", "")
  };
};

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
  if (rules.mode === "first_monthly") {
    // the first monthly fee promised in the student's proposal (an accepted one first, else the latest)
    const proposals = await Proposal.findAll({ where: { leadId: lead.id }, order: [["id", "DESC"]], limit: 10 });
    const pick = proposals.find(p => p.status === "accepted") || proposals[0];
    const first = Number(pick?.firstMonthly) || 0;
    return {
      amount: Math.round(first * 100) / 100,
      reason: first ? "1ª mensalidade da proposta" : "Sem proposta com a 1ª mensalidade: confira o valor",
      campaignId: null
    };
  }
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

// the date the affiliate is due to be paid: the confirmation day plus the days in the rules (company timezone)
const dueDate = (days: number): string => {
  const t = new Date(Date.now() + days * 86400000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Porto_Velho", year: "numeric", month: "2-digit", day: "2-digit" }).format(t);
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
    await existing.update({ dueAt: dueDate(rules.payDays) });
    row = existing;
  } else {
    row = await AffiliateBonus.create({
      affiliateId: aff.id,
      leadId,
      campaignId: worth.campaignId,
      kind: rules.kind,
      amount: worth.amount,
      status: "pending",
      reason: worth.reason,
      dueAt: dueDate(rules.payDays)
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
