import { Request, Response } from "express";

import AppError from "../errors/AppError";
import { getAppTz } from "../helpers/AppTime";
import { metaCosts } from "../services/ChannelServices/MetaCosts";
import { META_RATES_BR, META_RATES_DATE, META_RULES } from "../services/ChannelServices/MetaRates";
import { Op } from "sequelize";
import { dayBounds } from "../helpers/AppTime";
import OutboundDelivery from "../models/OutboundDelivery";
import { monthBudget } from "../services/OutboundServices/MonthBudget";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

// Configurações → Custos da API oficial: the real spending read on the Meta (period: from/to, default this month)
export const show = async (req: Request, res: Response): Promise<Response> => {
  const tz = getAppTz();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: tz });
  const to = String(req.query.to || today);
  const from = String(req.query.from || `${today.slice(0, 8)}01`);
  if (!DAY.test(from) || !DAY.test(to) || from > to) throw new AppError("ERR_INVALID_PERIOD", 400);
  if ((new Date(to).getTime() - new Date(from).getTime()) / 86400000 > 92) throw new AppError("ERR_INVALID_PERIOD", 400);
  const report = await metaCosts(from, to, tz, req.query.fresh === "1");
  // what the system estimated for the same days (the flat rate of Operação e custos, used by the daily budget): compared with the real
  // cost, it shows whether the rate is right; with the account in another currency, the comparison is only indicative
  const { start } = dayBounds(from, tz);
  const { end } = dayBounds(to, tz);
  const where = { createdAt: { [Op.between]: [start, end] }, channel: "whatsapp_cloud", status: { [Op.in]: ["sent", "uncertain"] } } as any;
  const [estimatedUsd, messages, unpriced, month] = await Promise.all([
    OutboundDelivery.sum("estimatedUsd", { where }),
    OutboundDelivery.count({ where }),
    OutboundDelivery.count({ where: { ...where, estimatedUsd: null } }),
    monthBudget()
  ]);
  const real = Number(report.total || 0);
  const est = Number(estimatedUsd || 0);
  const suggestedRate = messages > unpriced && real > 0 && (!report.currency || report.currency === "USD") ? Math.round((real / (messages - unpriced)) * 10000) / 10000 : null;
  return res.json({
    ...report,
    // the estimate of this month against the cap of the month (Operação e custos)
    month,
    estimate: { usd: Math.round(est * 100) / 100, messages, unpriced, sameCurrency: !report.currency || report.currency === "USD", suggestedRate },
    // how the Meta charges, with the reference rate of each category (Brazil) and the date of the table
    pricing: { date: META_RATES_DATE, currency: "USD", country: "Brasil", rates: META_RATES_BR, rules: META_RULES }
  });
};
