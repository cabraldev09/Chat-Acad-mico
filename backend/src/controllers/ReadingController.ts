import { Request, Response } from "express";
import { Op } from "sequelize";

import AppError from "../errors/AppError";
import { dayBounds } from "../helpers/AppTime";
import Lead from "../models/Lead";
import { crmPolosOf } from "../middleware/scope";
import { readingSettings, readingsSummary, saveReadingSettings } from "../services/ReadingServices/Queue";
import { outcomeSummary } from "../services/ReadingServices/Outcome";

// who reads the conversations (the system's AI or OpenBot through the API) and how much each one did
export const settings = async (_req: Request, res: Response): Promise<Response> =>
  res.json({ ...(await readingSettings()), summary: await readingsSummary() });

export const saveSettings = async (req: Request, res: Response): Promise<Response> => {
  const { provider, waitHours, maxPerDay } = req.body || {};
  if (provider !== undefined && !["sistema", "openbot"].includes(provider)) throw new AppError("ERR_INVALID_PARAMETER", 400);
  return res.json({ ...(await saveReadingSettings({ provider, waitHours, maxPerDay })), summary: await readingsSummary() });
};

// "Por que vendemos e por que perdemos" of a period: the codes of the readings of the leads the person may see (the coordination: its polos)
export const outcomes = async (req: Request, res: Response): Promise<Response> => {
  const isDay = (v: any) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ""));
  const today = req.query.range === "today" ? dayBounds() : null;
  const to = today ? today.end : isDay(req.query.to) ? dayBounds(String(req.query.to)).end : new Date();
  const from = today ? today.start : isDay(req.query.from) ? dayBounds(String(req.query.from)).start : new Date(to.getTime() - 30 * 864e5);
  const polos = await crmPolosOf(req);
  const leadIds = polos ? (await Lead.findAll({ where: { poloId: { [Op.in]: polos.length ? polos : [0] } } as any, attributes: ["id"] })).map(l => l.id) : null;
  return res.json(await outcomeSummary(from, to, leadIds));
};

// "Ler agora": the conversations waiting are put in the queue and the system's AI reads what it should (the same round of the worker)
export const runNow = async (_req: Request, res: Response): Promise<Response> => {
  const { enqueueImported } = await import("../services/ReadingServices/ImportedLeads");
  const { enqueueOutcomes } = await import("../services/ReadingServices/Outcome");
  const { runLocalReadings } = await import("../services/ReadingServices/Queue");
  const imported = await enqueueImported();
  const outcomes = await enqueueOutcomes();
  const run = await runLocalReadings();
  return res.json({ queued: { imported, outcomes }, ...run, summary: await readingsSummary() });
};
