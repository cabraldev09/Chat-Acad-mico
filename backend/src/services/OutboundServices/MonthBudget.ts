import { Op, fn, col } from "sequelize";
import OutboundDelivery from "../../models/OutboundDelivery";
import { getSetting } from "../../helpers/AppSettings";
import { monthStartApp } from "../../helpers/AppTime";
import { FREE_SERVICE_PER_NUMBER } from "../ChannelServices/MetaRates";

export interface MonthBudget {
  since: string; spentUsd: number; capUsd: number; usdBrl: number; pct: number | null; leftUsd: number | null;
  byCategory: Array<{ category: string; messages: number; usd: number }>;
  byNumber: Array<{ whatsappId: number; messages: number; usd: number; freeAnswersLeft: number }>;
}

const round = (n: number) => Math.round(n * 10000) / 10000;

// What the Meta sends of the month are estimated to cost against the cap of the month (Operação e custos), by category and by number.
export const monthBudget = async (): Promise<MonthBudget> => {
  const since = monthStartApp();
  const where = { createdAt: { [Op.gte]: since }, status: { [Op.in]: ["sending", "sent", "uncertain"] }, channel: "whatsapp_cloud" } as any;
  const [capRaw, rateRaw, cats, nums, answers] = await Promise.all([
    getSetting("outbound_monthly_usd", "148"), getSetting("outbound_usd_brl", "5.40"),
    OutboundDelivery.findAll({ where, attributes: ["category", [fn("COUNT", col("id")), "messages"], [fn("SUM", col("estimatedUsd")), "usd"]], group: ["category"], raw: true }) as any,
    OutboundDelivery.findAll({ where, attributes: ["whatsappId", [fn("COUNT", col("id")), "messages"], [fn("SUM", col("estimatedUsd")), "usd"]], group: ["whatsappId"], raw: true }) as any,
    OutboundDelivery.findAll({ where: { ...where, category: "SERVICE" }, attributes: ["whatsappId", [fn("COUNT", col("id")), "messages"]], group: ["whatsappId"], raw: true }) as any
  ]);
  const spentUsd = round((cats as any[]).reduce((t, r) => t + Number(r.usd || 0), 0));
  const capUsd = Number(capRaw) > 0 ? Number(capRaw) : 0;
  const usdBrl = Number(rateRaw) > 0 ? Number(rateRaw) : 5.4;
  const answered = new Map<number, number>((answers as any[]).map(r => [Number(r.whatsappId), Number(r.messages)]));
  return {
    since: since.toISOString(),
    spentUsd,
    capUsd,
    usdBrl,
    pct: capUsd ? Math.round((spentUsd / capUsd) * 1000) / 10 : null,
    leftUsd: capUsd ? round(Math.max(0, capUsd - spentUsd)) : null,
    byCategory: (cats as any[]).map(r => ({ category: r.category || "SEM_CATEGORIA", messages: Number(r.messages), usd: round(Number(r.usd || 0)) })),
    byNumber: (nums as any[]).map(r => ({
      whatsappId: Number(r.whatsappId), messages: Number(r.messages), usd: round(Number(r.usd || 0)),
      freeAnswersLeft: Math.max(0, FREE_SERVICE_PER_NUMBER - (answered.get(Number(r.whatsappId)) || 0))
    }))
  };
};
