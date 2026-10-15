import { Request, Response } from "express";
import { Op } from "sequelize";

import AppError from "../errors/AppError";
import Goal from "../models/Goal";
import GoalMember from "../models/GoalMember";
import GoalPolo from "../models/GoalPolo";
import Polo from "../models/Polo";
import Lead from "../models/Lead";
import { dayBounds, getAppTz } from "../helpers/AppTime";

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

// the goals a person is part of (for their own home screen): their line and the team total
export const progressForUser = async (userId: number) => {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Porto_Velho", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const goals = await Goal.findAll({ where: { status: "active", endsOn: { [Op.gte]: today } as any }, include: [GoalMember], order: [["endsOn", "ASC"]], limit: 6 });
  const out: any[] = [];
  for (const g of goals) {
    // eslint-disable-next-line no-await-in-loop
    const p = await present(g);
    const mine = p.members.find(m => m.userIds.includes(userId));
    if (mine) out.push({ id: p.id, title: p.title, startsOn: p.startsOn, endsOn: p.endsOn, daysLeft: p.daysLeft, elapsedPct: p.elapsedPct, mine, total: p.total });
  }
  return out;
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

// ---------------------------------------------------------------- goals per polo (the whole team follows them)

const dayOk = (iso: string, workDays: number): boolean => {
  const dow = new Date(`${iso}T12:00:00Z`).getUTCDay(); // 0 = Sunday
  return workDays >= 7 ? true : workDays === 6 ? dow !== 0 : dow !== 0 && dow !== 6;
};

// working days from `from` to `to`, both included
const countWorkDays = (from: string, to: string, workDays: number): number => {
  let n = 0;
  const cur = new Date(`${from}T12:00:00Z`);
  const end = new Date(`${to}T12:00:00Z`);
  for (let i = 0; cur <= end && i < 400; i += 1) {
    if (dayOk(cur.toISOString().slice(0, 10), workDays)) n += 1;
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return n;
};

// how many leads it takes to get one enrollment, from what the CRM did in the last 120 days (4 when there is too little data)
const leadsPerEnrollment = async (): Promise<number> => {
  const since = new Date(Date.now() - 120 * 86400000);
  const [created, won] = await Promise.all([
    Lead.count({ where: { isHistorical: false, createdAt: { [Op.gte]: since } as any } }),
    Lead.count({ where: { isHistorical: false, wonAt: { [Op.gte]: since } as any } })
  ]);
  if (created < 30 || won < 5) return 4;
  return Math.min(20, Math.max(1, Math.round((created / won) * 10) / 10));
};

const poloStatus = (pct: number | null): "great" | "good" | "warn" | "low" | "none" =>
  pct === null ? "none" : pct >= 100 ? "great" : pct >= 60 ? "good" : pct >= 30 ? "warn" : "low";

export const poloBoard = async (req: Request, res: Response): Promise<Response> => {
  const periods = await Goal.findAll({ where: { status: "active" }, order: [["endsOn", "DESC"], ["id", "DESC"]], limit: 24 });
  if (!periods.length) return res.json({ periods: [], goal: null, rows: [], totals: null });
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: getAppTz() }).format(new Date());
  const wanted = Number(req.query.goalId) || 0;
  const goal =
    periods.find(g => g.id === wanted) ||
    periods.find(g => g.startsOn <= today && g.endsOn >= today) ||
    periods[0];

  const start = dayBounds(goal.startsOn).start;
  const end = dayBounds(goal.endsOn).end;
  const [polos, saved, wonRows, ratio] = await Promise.all([
    Polo.findAll({ where: { active: true }, order: [["name", "ASC"]] }),
    GoalPolo.findAll({ where: { goalId: goal.id } }),
    Lead.findAll({
      where: { isHistorical: false, poloId: { [Op.ne]: null } as any, wonAt: { [Op.gte]: start, [Op.lte]: end } as any },
      attributes: ["poloId"],
      raw: true
    }) as unknown as Promise<any[]>,
    leadsPerEnrollment()
  ]);
  const won = new Map<number, number>();
  wonRows.forEach(r => won.set(r.poloId, (won.get(r.poloId) || 0) + 1));
  const line = new Map(saved.map(g => [g.poloId, g]));

  const from = today > goal.startsOn ? today : goal.startsOn;
  const daysLeft = goal.endsOn < today ? 0 : countWorkDays(from, goal.endsOn, goal.workDays || 5);
  const rows = polos
    .map(p => {
      const g = line.get(p.id);
      const target = g && g.target !== null && g.target !== undefined ? g.target : null;
      const auto = won.get(p.id) || 0;
      const manual = g?.manualCount || 0;
      const done = auto + manual;
      const canceled = g?.canceled || 0;
      const missing = target === null ? null : target - done; // negative = above the target
      // enrollments needed per remaining working day (0 once the target is reached, null when there is no day left)
      const perDay = missing === null ? null : missing <= 0 ? 0 : daysLeft ? Math.round((missing / daysLeft) * 100) / 100 : null;
      const pct = target ? Math.round((done / target) * 10000) / 100 : null;
      return {
        poloId: p.id,
        code: p.code,
        name: p.name,
        target,
        auto,
        manual,
        done,
        missing,
        pct,
        status: poloStatus(pct),
        perDay,
        leadsPerDay: perDay === null ? null : Math.round(perDay * ratio * 100) / 100,
        canceled,
        inCourse: Math.max(0, done - canceled),
        canceledPct: done ? Math.round((canceled / done) * 10000) / 100 : 0
      };
    })
    .filter(r => r.target !== null || r.done > 0 || r.canceled > 0)
    .sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1) || b.done - a.done);

  // the totals add up only the polos that have a target, so "done", "target" and "missing" always agree
  const scoped = rows.filter(r => r.target !== null);
  const sum = (f: (r: typeof rows[number]) => number) => scoped.reduce((t, r) => t + f(r), 0);
  const target = sum(r => r.target || 0);
  const done = sum(r => r.done);
  const missing = target - done;
  const perDay = missing <= 0 ? 0 : daysLeft ? Math.round((missing / daysLeft) * 100) / 100 : null;
  const canceled = sum(r => r.canceled);
  const totals = {
    target,
    done,
    missing,
    pct: target ? Math.round((done / target) * 10000) / 100 : null,
    perDay,
    leadsPerDay: perDay === null ? null : Math.round(perDay * ratio * 100) / 100,
    canceled,
    inCourse: Math.max(0, done - canceled),
    canceledPct: done ? Math.round((canceled / done) * 10000) / 100 : 0
  };
  return res.json({
    periods: periods.map(g => ({ id: g.id, title: g.title, startsOn: g.startsOn, endsOn: g.endsOn })),
    goal: { id: goal.id, title: goal.title, startsOn: goal.startsOn, endsOn: goal.endsOn, workDays: goal.workDays || 5, daysLeft },
    leadsPerEnrollment: ratio,
    rows,
    totals,
    // polos without a line yet, so the administration can add them
    available: polos.filter(p => !rows.some(r => r.poloId === p.id)).map(p => ({ id: p.id, code: p.code, name: p.name }))
  });
};

// administration: targets, adjustments and the working-day rule of the period
export const updatePolos = async (req: Request, res: Response): Promise<Response> => {
  const goal = await load(req.params.id);
  const b = req.body || {};
  if (b.workDays !== undefined) {
    const wd = Number(b.workDays);
    await goal.update({ workDays: wd === 6 || wd === 7 ? wd : 5 });
  }
  if (Array.isArray(b.rows)) {
    const valid = new Set((await Polo.findAll({ attributes: ["id"] })).map(p => p.id));
    await GoalPolo.destroy({ where: { goalId: goal.id } });
    const rows = b.rows
      .map((r: any) => ({
        goalId: goal.id,
        poloId: Number(r.poloId),
        target: int(r.target),
        manualCount: int(r.manual) || 0,
        canceled: int(r.canceled) || 0
      }))
      .filter((r: any) => valid.has(r.poloId));
    if (rows.length) await GoalPolo.bulkCreate(rows as any);
  }
  req.query.goalId = String(goal.id);
  return poloBoard(req, res);
};
