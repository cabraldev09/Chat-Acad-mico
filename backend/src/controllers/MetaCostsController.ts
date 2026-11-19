import { Request, Response } from "express";

import AppError from "../errors/AppError";
import { getAppTz } from "../helpers/AppTime";
import { metaCosts } from "../services/ChannelServices/MetaCosts";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

// Configurações → Custos da API oficial: the real spending read on the Meta (period: from/to, default this month)
export const show = async (req: Request, res: Response): Promise<Response> => {
  const tz = getAppTz();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: tz });
  const to = String(req.query.to || today);
  const from = String(req.query.from || `${today.slice(0, 8)}01`);
  if (!DAY.test(from) || !DAY.test(to) || from > to) throw new AppError("ERR_INVALID_PERIOD", 400);
  if ((new Date(to).getTime() - new Date(from).getTime()) / 86400000 > 92) throw new AppError("ERR_INVALID_PERIOD", 400);
  return res.json(await metaCosts(from, to, tz, req.query.fresh === "1"));
};
