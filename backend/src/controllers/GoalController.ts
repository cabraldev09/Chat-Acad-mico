import { Request, Response } from "express";
import { Op } from "sequelize";

import AppError from "../errors/AppError";
import Goal from "../models/Goal";
import GoalMember from "../models/GoalMember";
import Lead from "../models/Lead";
import { dayBounds } from "../helpers/AppTime";

// Team enrollment goals (administration and coordination). Each line counts, by itself, the enrollments (Leads.wonAt) of
// its CRM users inside the period, plus a manual adjustment for people without a login or shared lines.
const isDate = (v: any): boolean => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ""));
const ids = (raw: any): number[] => {
  try {
    const list = typeof raw === "string" ? JSON.parse(raw) : raw;
    return Array.isArray(list) ? list.map(Number).filter(n => Number.isInteger(n) && n > 0) : [];
  } catch (e) {
    return [];
  }
};
const int = (v: any, min = 0): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(min, n) : null;
};

const present = async (goal: Goal) => {
  const start = dayBounds(goal.startsOn).start;
  const end = dayBounds(goal.endsOn).end;
  const members = [...(goal.members || [])].sort((a, b) => a.position - b.position || a.id - b.id);
  const allUserIds: number[] = Array.from(new Set(members.reduce((all: number[], m) => all.concat(ids(m.userIds)), [])));
  const rows = allUserIds.length
    ? ((await Lead.findAll({
        where: { ownerId: allUserIds, isHistorical: false, wonAt: { [Op.gte]: start, [Op.lte]: end } as any },
        attributes: ["ownerId"],
        raw: true
      })) as any[])
    : [];
  const perUser = new Map<number, number>();
  rows.forEach(r => perUser.set(r.ownerId, (perUser.get(r.ownerId) || 0) + 1));

  const now = Date.now();
  const totalDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000));
  const daysLeft = now > end.getTime() ? 0 : Math.max(0, Math.ceil((end.getTime() - Math.max(now, start.getTime())) / 86400000));

  const lines = members.map(m => {
    const userIds = ids(m.userIds);
    const auto = userIds.reduce((t, id) => t + (perUser.get(id) || 0), 0);
    const done = auto + (m.manualCount || 0);
    const target = m.target === null || m.target === undefined ? null : m.target;
    const missing = target === null ? null : Math.max(0, target - done);
    return {
      id: m.id,
      label: m.label,
      userIds,
      target,
      auto,
      manual: m.manualCount || 0,
      done,
      pct: target ? Math.min(100, Math.round((done / target) * 100)) : null,
      missing,
      reached: target !== null && target > 0 && done >= target,
      // enrollments per remaining day needed to get there
      pace: missing && daysLeft ? Math.round((missing / daysLeft) * 10) / 10 : null,
      note: m.note
    };
  });
  const target = lines.reduce((t, l) => t + (l.target || 0), 0);
  const done = lines.reduce((t, l) => t + l.done, 0);
  return {
    id: goal.id,
    title: goal.title,
    startsOn: goal.startsOn,
    endsOn: goal.endsOn,
    status: goal.status,
    daysLeft,
    totalDays,
    elapsedPct: Math.min(100, Math.max(0, Math.round(((now - start.getTime()) / (end.getTime() - start.getTime())) * 100))),
    total: { target, done, pct: target ? Math.min(100, Math.round((done / target) * 100)) : null },
    members: lines
  };
};

const load = async (id: number | string): Promise<Goal> => {
  const goal = await Goal.findByPk(id, { include: [GoalMember] });
  if (!goal) throw new AppError("ERR_NOT_FOUND", 404);
  return goal;
};

const writeMembers = async (goalId: number, list: any[]): Promise<void> => {
  if (!Array.isArray(list)) return;
  await GoalMember.destroy({ where: { goalId } });
  const rows = list
    .map((m, i) => ({
      goalId,
      label: String(m.label || "").trim().slice(0, 80),
      userIds: JSON.stringify([...new Set(ids(m.userIds))]),
      target: int(m.target),
      manualCount: int(m.manualCount) || 0,
      note: m.note ? String(m.note).slice(0, 120) : null,
      position: i
    }))
    .filter(m => m.label);
  if (rows.length) await GoalMember.bulkCreate(rows as any);
};

export const index = async (req: Request, res: Response): Promise<Response> => {
  const status = req.query.status === "archived" ? "archived" : "active";
  const goals = await Goal.findAll({ where: { status }, include: [GoalMember], order: [["endsOn", "DESC"], ["id", "DESC"]], limit: 24 });
  return res.json(await Promise.all(goals.map(present)));
};

export const store = async (req: Request, res: Response): Promise<Response> => {
  const b = req.body || {};
  if (!isDate(b.startsOn) || !isDate(b.endsOn) || b.startsOn > b.endsOn) throw new AppError("ERR_GOAL_PERIOD", 400);
  const goal = await Goal.create({ title: b.title ? String(b.title).slice(0, 80) : null, startsOn: b.startsOn, endsOn: b.endsOn, createdBy: Number(req.user.id) } as any);
  await writeMembers(goal.id, b.members || []);
  return res.status(201).json(await present(await load(goal.id)));
};

export const update = async (req: Request, res: Response): Promise<Response> => {
  const goal = await load(req.params.id);
  const b = req.body || {};
  const data: any = {};
  if (b.title !== undefined) data.title = b.title ? String(b.title).slice(0, 80) : null;
  if (b.startsOn !== undefined) data.startsOn = b.startsOn;
  if (b.endsOn !== undefined) data.endsOn = b.endsOn;
  if (b.status !== undefined) data.status = b.status === "archived" ? "archived" : "active";
  const startsOn = data.startsOn || goal.startsOn;
  const endsOn = data.endsOn || goal.endsOn;
  if (!isDate(startsOn) || !isDate(endsOn) || startsOn > endsOn) throw new AppError("ERR_GOAL_PERIOD", 400);
  await goal.update(data);
  await writeMembers(goal.id, b.members);
  return res.json(await present(await load(goal.id)));
};

export const remove = async (req: Request, res: Response): Promise<Response> => {
  const goal = await load(req.params.id);
  await GoalMember.destroy({ where: { goalId: goal.id } });
  await goal.destroy();
  return res.json({ ok: true });
};

// "repeat the previous period": same people and targets, dates moved to the next period of the same length
export const repeat = async (req: Request, res: Response): Promise<Response> => {
  const goal = await load(req.params.id);
  const addDays = (d: string, n: number) => {
    const t = new Date(`${d}T12:00:00Z`);
    t.setUTCDate(t.getUTCDate() + n);
    return t.toISOString().slice(0, 10);
  };
  const addMonth = (d: string) => {
    const [y, m, day] = d.split("-").map(Number);
    const t = new Date(Date.UTC(y, m, 1, 12));
    const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
    return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(Math.min(day, last)).padStart(2, "0")}`;
  };
  // a period that spans a month (26/09 to 26/10) moves one month ahead; any other length moves by its own length
  const monthly = goal.startsOn.slice(8) === addDays(goal.endsOn, 0).slice(8) && goal.startsOn.slice(0, 7) !== goal.endsOn.slice(0, 7);
  const length = Math.round((new Date(`${goal.endsOn}T12:00:00Z`).getTime() - new Date(`${goal.startsOn}T12:00:00Z`).getTime()) / 86400000) + 1;
  const startsOn = monthly ? addMonth(goal.startsOn) : addDays(goal.endsOn, 1);
  const endsOn = monthly ? addMonth(goal.endsOn) : addDays(startsOn, length - 1);
  const copy = await Goal.create({ title: null, startsOn, endsOn, createdBy: Number(req.user.id) } as any);
  await writeMembers(
    copy.id,
    (goal.members || []).map(m => ({ label: m.label, userIds: ids(m.userIds), target: m.target, manualCount: 0, note: m.note }))
  );
  return res.status(201).json(await present(await load(copy.id)));
};
