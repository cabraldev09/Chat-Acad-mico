import { Request, Response } from "express";

import AppError from "../errors/AppError";
import { setSetting } from "../helpers/AppSettings";
import { logger } from "../utils/logger";
import {
  daysOf, hasRecentSimulation, KEYS, MAX_DAYS, MIN_DAYS, recentRuns, retentionConfig, simulateContentRetention, SUGGESTED
} from "../services/SystemServices/ContentRetention";

// Configurações > Retenção de dados (administrator only, never coordination: deleting content is irreversible). The rules start off.

const view = async () => ({
  ...(await retentionConfig()),
  suggested: SUGGESTED,
  limits: { min: MIN_DAYS, max: MAX_DAYS },
  runs: await recentRuns(20)
});

export const show = async (_req: Request, res: Response): Promise<Response> => res.json(await view());

// 0 turns a rule off; any other number is between 30 days and 10 years
export const save = async (req: Request, res: Response): Promise<Response> => {
  const b = req.body || {};
  const valid = (v: any) => v === 0 || v === "0" || (Number.isFinite(Number(v)) && Number(v) >= MIN_DAYS && Number(v) <= MAX_DAYS);
  if (b.conversationDays !== undefined && !valid(b.conversationDays)) throw new AppError("ERR_RETENTION_DAYS", 400);
  if (b.audioDays !== undefined && !valid(b.audioDays)) throw new AppError("ERR_RETENTION_DAYS", 400);
  // turning a rule on, or giving it other days, needs a simulation with those days in the last 24 hours (turning off never does)
  const current = await retentionConfig();
  const checks: Array<["audio" | "conversation", any, number]> = [["conversation", b.conversationDays, current.conversationDays], ["audio", b.audioDays, current.audioDays]];
  for (const [rule, v, now] of checks) {
    const days = v === undefined ? 0 : daysOf(v);
    // eslint-disable-next-line no-await-in-loop
    if (days > 0 && days !== now && !(await hasRecentSimulation(rule, days))) throw new AppError("ERR_RETENTION_SIMULATION_REQUIRED", 409);
  }
  if (b.conversationDays !== undefined) await setSetting(KEYS.conversation, String(daysOf(b.conversationDays)));
  if (b.audioDays !== undefined) await setSetting(KEYS.audio, String(daysOf(b.audioDays)));
  const cfg = await retentionConfig();
  logger.info(`Retenção de dados alterada pelo usuário #${req.user.id}: conversas ${cfg.conversationDays || "desligada"}, áudios ${cfg.audioDays || "desligada"}`);
  return res.json(await view());
};

// what would go with these numbers of days (or the saved ones, or the suggested ones while off): counts only, nothing is deleted
export const simulate = async (req: Request, res: Response): Promise<Response> => {
  const b = req.body || {};
  const cfg = await retentionConfig();
  const pick = (v: any, saved: number, suggested: number) => (v !== undefined && v !== null && v !== "" ? Number(v) : saved || suggested);
  const conversationDays = pick(b.conversationDays, cfg.conversationDays, SUGGESTED.conversationDays);
  const audioDays = pick(b.audioDays, cfg.audioDays, SUGGESTED.audioDays);
  const ok = (v: number) => v === 0 || (v >= MIN_DAYS && v <= MAX_DAYS);
  if (!ok(conversationDays) || !ok(audioDays)) throw new AppError("ERR_RETENTION_DAYS", 400);
  try {
    return res.json(await simulateContentRetention({ conversationDays, audioDays, actorId: Number(req.user.id) || null }));
  } catch (err) {
    logger.warn(`Simulação da retenção falhou: ${(err as Error).message}`);
    throw new AppError("ERR_RETENTION_SIMULATION", 503);
  }
};
