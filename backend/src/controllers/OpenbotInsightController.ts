import { Request, Response } from "express";

import AppError from "../errors/AppError";
import { resolveInsight } from "../services/InsightServices/OpenbotInsights";

// PUT /openbot-insights/:id/resolve ("Dispensar" in the commercial center): the administrator hides a recommendation of the OpenBot.
// The row stays (resolvedAt); the nightly maintenance deletes it after a month.
export const resolve = async (req: Request, res: Response): Promise<Response> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) throw new AppError("ERR_NOT_FOUND", 404);
  await resolveInsight(id);
  return res.json({ ok: true });
};
