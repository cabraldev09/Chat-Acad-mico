import { Request, Response } from "express";

import AppError from "../errors/AppError";
import { getSetting, setSetting } from "../helpers/AppSettings";
import { canOperateRetention } from "../helpers/Roles";
import * as Issues from "../services/TutoriaServices/Issues";

// The audit of the tutoring belongs to the management of the academic side (the administration and the academic coordination): the tutor
// does not see it. The AI finds what was left pending; here the management reads it, writes the protocol and its name, and closes it.
export const academicManagement = (req: Request, _res: Response, next: () => void): void => {
  if (!canOperateRetention(req.user as any)) throw new AppError("ERR_NO_PERMISSION", 403);
  next();
};

export const index = async (req: Request, res: Response): Promise<Response> =>
  res.json(await Issues.listIssues({ status: req.query.status ? String(req.query.status) : "abertas", tutorId: req.query.tutorId ? Number(req.query.tutorId) : null }));

export const store = async (req: Request, res: Response): Promise<Response> =>
  res.status(201).json(await Issues.createIssue(req.body || {}, Number(req.user.id)));

export const update = async (req: Request, res: Response): Promise<Response> => {
  const issue = await Issues.updateIssue(Number(req.params.id), req.body || {}, Number(req.user.id));
  if (!issue) throw new AppError("ERR_NOT_FOUND", 404);
  return res.json(issue);
};

export const count = async (_req: Request, res: Response): Promise<Response> => res.json({ open: await Issues.openCount() });

// the switch and the daily limit of the reading (Configurações), and a reading now
export const settings = async (_req: Request, res: Response): Promise<Response> =>
  res.json({ enabled: (await getSetting("tutoring_audit_enabled", "true")) === "true", maxPerDay: Number(await getSetting("tutoring_audit_max_tickets", "40")) || 40 });

export const saveSettings = async (req: Request, res: Response): Promise<Response> => {
  const b = req.body || {};
  if (typeof b.enabled === "boolean") await setSetting("tutoring_audit_enabled", b.enabled ? "true" : "false");
  if (b.maxPerDay !== undefined) await setSetting("tutoring_audit_max_tickets", String(Math.min(500, Math.max(1, Math.round(Number(b.maxPerDay) || 40)))));
  return settings(req, res);
};

export const runNow = async (_req: Request, res: Response): Promise<Response> => res.json(await Issues.runTutoringAudit({ force: true }));
