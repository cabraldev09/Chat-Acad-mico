import AppError from "../../errors/AppError";
import Campaign from "../../models/Campaign";
import Whatsapp from "../../models/Whatsapp";
import { getSetting } from "../../helpers/AppSettings";
import { estimateBatchUsd, tableRate } from "../ChannelServices/MetaRates";
import { monthBudget } from "../OutboundServices/MonthBudget";
import { approvedTemplates, categoryOf, templateCategories } from "./Templates";

export interface CampaignCost {
  official: boolean; category: string | null; categoryKnown: boolean; people: number; perMessageUsd: number; totalUsd: number; totalBrl: number;
  marketingAllowed: boolean; month: { spentUsd: number; capUsd: number; leftUsd: number | null; usdBrl: number }; fitsMonth: boolean;
}

// the category of a template, read on the Meta when the system does not know it yet (unknown counts as Marketing in the estimate)
export const knownCategory = async (whatsapp: Whatsapp, name: string): Promise<{ category: string; known: boolean }> => {
  if (!(await templateCategories())[name]) await approvedTemplates(whatsapp.id).catch(() => undefined);
  return { category: await categoryOf(name), known: !!(await templateCategories())[name] };
};

// What a campaign of templates of the official API is estimated to cost for `people` recipients, and whether it fits the cap of the
// month. A QR Code connection has no cost of the Meta.
export const campaignCost = async (campaign: { templateName?: string | null }, whatsapp: Whatsapp | null, people: number): Promise<CampaignCost> => {
  const [month, templateUsd, allow] = await Promise.all([monthBudget(), getSetting("outbound_meta_template_usd", ""), getSetting("outbound_allow_marketing", "false")]);
  const official = !!whatsapp && whatsapp.channel === "whatsapp_cloud" && !!campaign.templateName;
  const found = official ? await knownCategory(whatsapp as Whatsapp, String(campaign.templateName)) : null;
  const category = found ? found.category : null;
  const totalUsd = official ? estimateBatchUsd(people, category as string, templateUsd) : 0;
  const perMessageUsd = official ? (category === "MARKETING" ? tableRate("MARKETING") : people ? totalUsd / people : tableRate(category as string)) : 0;
  return {
    official, category, categoryKnown: !!found?.known, people, perMessageUsd: Math.round(perMessageUsd * 10000) / 10000, totalUsd,
    totalBrl: Math.round(totalUsd * month.usdBrl * 100) / 100,
    marketingAllowed: allow === "true",
    month: { spentUsd: month.spentUsd, capUsd: month.capUsd, leftUsd: month.leftUsd, usdBrl: month.usdBrl },
    fitsMonth: !month.capUsd || month.spentUsd + totalUsd <= month.capUsd
  };
};

// Before a campaign starts: a template the Meta classified as Marketing only with the permission of Operação e custos, and never past
// the cap of the month. A template whose category the Meta did not tell (it could not be read) is estimated as Marketing but not refused.
export const assertCampaignCost = async (campaign: Campaign, whatsapp: Whatsapp | null, people: number): Promise<CampaignCost> => {
  const cost = await campaignCost(campaign, whatsapp, people);
  if (cost.category === "MARKETING" && cost.categoryKnown && !cost.marketingAllowed) throw new AppError("ERR_CAMPAIGN_MARKETING_BLOCKED", 409);
  if (!cost.fitsMonth) throw new AppError("ERR_OUTBOUND_MONTH_BUDGET", 409);
  return cost;
};
