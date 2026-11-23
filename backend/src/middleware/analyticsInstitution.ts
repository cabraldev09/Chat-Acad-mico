import { NextFunction, Request, Response } from "express";

import AppError from "../errors/AppError";
import { allInstitutions } from "../helpers/Institution";
import { withAnalyticsInstitution } from "../services/AnalyticsServices/AnalyticsService";

// Estatísticas → "Universidade": ?institutionId=N runs the whole screen inside that university (its conversations and its leads; the ones
// with no university of their own count for the default). With no filter, the whole group. The same team serves every university, so the
// filter narrows what is counted, never who may see it.
const analyticsInstitution = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
  const raw = req.query.institutionId;
  if (raw === undefined || raw === "" || raw === "0") return next();
  const id = Number(raw);
  const inst = Number.isInteger(id) && id > 0 ? (await allInstitutions()).find(i => i.id === id) : null;
  if (!inst) throw new AppError("ERR_NOT_FOUND", 404);
  return withAnalyticsInstitution({ id: inst.id, isDefault: inst.isDefault }, async () => next());
};

export default analyticsInstitution;
