import { Op } from "sequelize";
import AiUsage from "../models/AiUsage";
import Reservation from "../models/AiBudgetReservation";
import OutboundDelivery from "../models/OutboundDelivery";
import { getSetting } from "../helpers/AppSettings";
import { dayBounds } from "../helpers/AppTime";
import { getIO } from "../libs/socket";
import { logger } from "../utils/logger";
let busy = false;
let day = "";
const notified = new Set<string>();
export const tickBudgetAlerts = async (): Promise<void> => {
  if (busy) return;
  busy = true;
  try {
    const since = dayBounds().start;
    if (day !== since.toISOString()) { day = since.toISOString(); notified.clear(); }
    const usageWhere = { createdAt: { [Op.gte]: since } };
    const sendWhere = { ...usageWhere, status: { [Op.in]: ["sent", "sending", "uncertain"] } };
    const active = { expiresAt: { [Op.gt]: new Date() } };
    const values: Array<[string, string, () => Promise<number>]> = [
      ["ai_daily_token_cap", "Tokens de IA", async () => Number(await AiUsage.sum("inputTokens", { where: usageWhere }) || 0) + Number(await AiUsage.sum("outputTokens", { where: usageWhere }) || 0) + Number(await AiUsage.sum("cacheReadTokens", { where: usageWhere }) || 0) + Number(await AiUsage.sum("cacheWriteTokens", { where: usageWhere }) || 0) + Number(await Reservation.sum("tokens", { where: active }) || 0)],
      ["ai_daily_usd_cap", "Orçamento estimado de IA", async () => Number(await AiUsage.sum("estimatedUsd", { where: usageWhere }) || 0) + Number(await Reservation.sum("estimatedUsd", { where: active }) || 0)],
      ["outbound_daily_messages", "Quantidade de envios", async () => OutboundDelivery.count({ where: sendWhere })],
      ["outbound_daily_usd", "Orçamento estimado da Meta", async () => Number(await OutboundDelivery.sum("estimatedUsd", { where: sendWhere }) || 0)]
    ];
    for (const [key, label, usage] of values) {
      const cap = Number(await getSetting(key, "0"));
      if (!(cap > 0)) continue;
      const used = await usage();
      const level = used >= cap ? 100 : used >= cap * 0.8 ? 80 : 0;
      const id = `${key}:${level}`;
      if (!level || notified.has(id)) continue;
      notified.add(id);
      getIO().emit("budgetAlert", { key, level, text: `${label}: ${level === 100 ? "limite diário atingido" : "80% do limite diário utilizado ou reservado"}. Confira Operação e custos.` });
    }
  } catch (err) { logger.warn(`Budget alerts: ${err}`); }
  finally { busy = false; }
};
export const startBudgetAlerts = (): void => { setInterval(tickBudgetAlerts, 60000); };
