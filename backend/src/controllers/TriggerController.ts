import { Request, Response } from "express";

import AppError from "../errors/AppError";
import AutomationTrigger from "../models/AutomationTrigger";
import ChatFlow from "../models/ChatFlow";
import { EVENTS } from "../services/FlowServices/Events";

const clip = (v: any, n: number): string => String(v || "").trim().slice(0, n);

const parse = (raw: string) => {
  try {
    return JSON.parse(raw || "{}");
  } catch (e) {
    return {};
  }
};

const present = async (t: AutomationTrigger) => {
  const flow = t.flowId ? await ChatFlow.findByPk(t.flowId, { attributes: ["id", "name", "status"] }) : null;
  const event = EVENTS.find(e => e.key === t.event);
  return {
    id: t.id,
    name: t.name,
    active: t.active,
    event: t.event,
    eventLabel: event?.label || t.event,
    config: parse(t.config),
    flowId: t.flowId,
    flowName: flow?.name || null,
    flowPublished: flow?.status === "published",
    runCount: t.runCount,
    lastRunAt: t.lastRunAt
  };
};

// only the filters the event offers are kept
const configFor = (eventKey: string, raw: any): Record<string, any> => {
  const def = EVENTS.find(e => e.key === eventKey);
  const out: Record<string, any> = {};
  (def?.filters || []).forEach(f => {
    const v = raw && raw[f.key];
    if (v !== undefined && v !== null && v !== "") out[f.key] = f.kind === "text" ? clip(v, 20) : Number(v);
  });
  return out;
};

export const catalog = async (_req: Request, res: Response): Promise<Response> => res.json(EVENTS);

export const index = async (_req: Request, res: Response): Promise<Response> => {
  const rows = await AutomationTrigger.findAll({ order: [["id", "DESC"]] });
  return res.json(await Promise.all(rows.map(present)));
};

export const store = async (req: Request, res: Response): Promise<Response> => {
  const b = req.body || {};
  const event = EVENTS.find(e => e.key === b.event);
  if (!event || !event.available) throw new AppError("ERR_TRIGGER_EVENT_UNAVAILABLE", 400);
  const name = clip(b.name, 80);
  if (!name) throw new AppError("ERR_FIELD_REQUIRED_name", 400);
  if (!b.flowId || !(await ChatFlow.findByPk(Number(b.flowId)))) throw new AppError("ERR_NOT_FOUND", 404);
  const t = await AutomationTrigger.create({ name, event: event.key, config: JSON.stringify(configFor(event.key, b.config)), flowId: Number(b.flowId), active: b.active !== false, createdBy: Number(req.user.id) } as any);
  return res.status(201).json(await present(t));
};

export const update = async (req: Request, res: Response): Promise<Response> => {
  const t = await AutomationTrigger.findByPk(req.params.id);
  if (!t) throw new AppError("ERR_NOT_FOUND", 404);
  const b = req.body || {};
  const patch: any = {};
  if (b.name !== undefined) {
    if (!clip(b.name, 80)) throw new AppError("ERR_FIELD_REQUIRED_name", 400);
    patch.name = clip(b.name, 80);
  }
  if (b.active !== undefined) patch.active = !!b.active;
  if (b.event !== undefined) {
    const event = EVENTS.find(e => e.key === b.event);
    if (!event || !event.available) throw new AppError("ERR_TRIGGER_EVENT_UNAVAILABLE", 400);
    patch.event = event.key;
  }
  if (b.flowId !== undefined) {
    if (!(await ChatFlow.findByPk(Number(b.flowId)))) throw new AppError("ERR_NOT_FOUND", 404);
    patch.flowId = Number(b.flowId);
  }
  if (b.config !== undefined || b.event !== undefined) patch.config = JSON.stringify(configFor(patch.event || t.event, b.config !== undefined ? b.config : parse(t.config)));
  await t.update(patch);
  return res.json(await present(t));
};

export const remove = async (req: Request, res: Response): Promise<Response> => {
  const t = await AutomationTrigger.findByPk(req.params.id);
  if (!t) throw new AppError("ERR_NOT_FOUND", 404);
  await t.destroy();
  return res.json({ ok: true });
};
