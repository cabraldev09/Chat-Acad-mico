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
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: getAppTz(), year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const goals = await Goal.findAll({ where: { status: "active", kind: "team", endsOn: { [Op.gte]: today } as any }, include: [GoalMember], order: [["endsOn", "ASC"]], limit: 6 });
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
      // the screen sends it as `manual` (what the list answers with); `manualCount` is the column name
      manualCount: int(m.manual ?? m.manualCount) || 0,
      note: m.note ? String(m.note).slice(0, 120) : null,
      position: i
    }))
    .filter(m => m.label);
  if (rows.length) await GoalMember.bulkCreate(rows as any);
};

export const index = async (req: Request, res: Response): Promise<Response> => {
  const status = req.query.status === "archived" ? "archived" : "active";
  const goals = await Goal.findAll({ where: { status, kind: "team" }, include: [GoalMember], order: [["endsOn", "DESC"], ["id", "DESC"]], limit: 24 });
  return res.json(await Promise.all(goals.map(present)));
};

export const store = async (req: Request, res: Response): Promise<Response> => {
  const b = req.body || {};
  if (!isDate(b.startsOn) || !isDate(b.endsOn) || b.startsOn > b.endsOn) throw new AppError("ERR_GOAL_PERIOD", 400);
  const goal = await Goal.create({ title: b.title ? String(b.title).slice(0, 80) : null, startsOn: b.startsOn, endsOn: b.endsOn, kind: b.kind === "polo" ? "polo" : "team", createdBy: Number(req.user.id) } as any);
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
  const copy = await Goal.create({ title: null, startsOn, endsOn, kind: goal.kind, createdBy: Number(req.user.id) } as any);
  await writeMembers(
    copy.id,
    (goal.members || []).map(m => ({ label: m.label, userIds: ids(m.userIds), target: m.target, manualCount: 0, note: m.note }))
  );
  return res.status(201).json(await present(await load(copy.id)));
};

// ---------------------------------------------------------------- goals per polo (the whole team follows them)
// A polo has a target for the whole period (a semester) and a target for each month of it. Done = enrollments counted from
// the CRM (Leads.wonAt of the polo) + what the administration typed (a total for the period and/or adjustments of a month).

const dayOk = (iso: string, workDays: number): boolean => {
  const dow = new Date(`${iso}T12:00:00Z`).getUTCDay(); // 0 = Sunday
  return workDays >= 7 ? true : workDays === 6 ? dow !== 0 : dow !== 0 && dow !== 6;
};

// working days from `from` to `to`, both included
const countWorkDays = (from: string, to: string, workDays: number): number => {
  let n = 0;
  const cur = new Date(`${from}T12:00:00Z`);
  const end = new Date(`${to}T12:00:00Z`);
  for (let i = 0; cur <= end && i < 800; i += 1) {
    if (dayOk(cur.toISOString().slice(0, 10), workDays)) n += 1;
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return n;
};

// "2026-07" ... "2026-12" between the two dates
export const monthsOf = (startsOn: string, endsOn: string): string[] => {
  const out: string[] = [];
  let [y, m] = startsOn.split("-").map(Number);
  const [ey, em] = endsOn.split("-").map(Number);
  while ((y < ey || (y === ey && m <= em)) && out.length < 36) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
};

// even split of a total over n months; the remainder goes to the first months
export const distribute = (total: number, n: number): number[] => {
  const base = Math.floor(total / n);
  const extra = total - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < extra ? 1 : 0));
};

const parseJson = (raw: any, fallback: any) => {
  try {
    const v = typeof raw === "string" ? JSON.parse(raw) : raw;
    return v === null || v === undefined ? fallback : v;
  } catch (e) {
    return fallback;
  }
};

const monthlyOf = (g: GoalPolo | undefined, n: number, target: number | null): number[] => {
  const saved = parseJson(g?.monthly, null);
  if (Array.isArray(saved) && saved.length === n && saved.every(v => Number.isFinite(Number(v)))) return saved.map(v => Math.max(0, Math.round(Number(v))));
  return target === null ? new Array(n).fill(0) : distribute(target, n);
};

const statusOf = (pct: number | null): "great" | "good" | "warn" | "low" | "none" =>
  pct === null ? "none" : pct >= 100 ? "great" : pct >= 60 ? "good" : pct >= 30 ? "warn" : "low";

const pctOf = (done: number, target: number | null): number | null => (target ? Math.round((done / target) * 10000) / 100 : null);
const perDayOf = (missing: number | null, daysLeft: number): number | null =>
  missing === null ? null : missing <= 0 ? 0 : daysLeft ? Math.round((missing / daysLeft) * 100) / 100 : null;

// The board of the polos: target, done and pace of each one in the current period. Used by the Metas screen and by the
// manager's overview (Estatísticas), so both always show the same numbers.
export const buildPoloBoard = async (goalIdWanted = 0, monthWanted = ""): Promise<any> => {
  const periods = await Goal.findAll({ where: { status: "active", kind: "polo" }, order: [["startsOn", "DESC"], ["id", "DESC"]], limit: 24 });
  // no semester yet: the same shape, empty, so the screen can show the way to create one
  if (!periods.length) return { periods: [], goal: null, months: [], month: null, rows: [], totals: null, monthTotals: [], available: [] };
  const tz = getAppTz();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
  const wanted = goalIdWanted;
  const goal =
    periods.find(g => g.id === wanted) ||
    periods.find(g => g.startsOn <= today && g.endsOn >= today) ||
    periods[0];
  const wd = goal.workDays || 5;
  const months = monthsOf(goal.startsOn, goal.endsOn);
  const monthKey = months.includes(monthWanted) ? monthWanted : null;

  const start = dayBounds(goal.startsOn).start;
  const end = dayBounds(goal.endsOn).end;
  const [polos, saved, wonRows] = await Promise.all([
    Polo.findAll({ where: { active: true }, order: [["name", "ASC"]] }),
    GoalPolo.findAll({ where: { goalId: goal.id } }),
    Lead.findAll({
      where: { isHistorical: false, poloId: { [Op.ne]: null } as any, wonAt: { [Op.gte]: start, [Op.lte]: end } as any },
      attributes: ["poloId", "wonAt"],
      raw: true
    }) as unknown as Promise<any[]>
  ]);
  // enrollments of each polo by month (in the company timezone)
  const wonBy = new Map<number, Record<string, number>>();
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: tz });
  wonRows.forEach(r => {
    const key = fmt.format(new Date(r.wonAt)).slice(0, 7);
    const bucket = wonBy.get(r.poloId) || {};
    bucket[key] = (bucket[key] || 0) + 1;
    wonBy.set(r.poloId, bucket);
  });
  const line = new Map(saved.map(g => [g.poloId, g]));

  const from = today > goal.startsOn ? today : goal.startsOn;
  const daysLeft = goal.endsOn < today ? 0 : countWorkDays(from, goal.endsOn, wd);
  // how much of the period has already gone by (in working days): the pace a polo should have by now
  const daysTotal = countWorkDays(goal.startsOn, goal.endsOn, wd);
  const daysDone = today < goal.startsOn ? 0 : countWorkDays(goal.startsOn, goal.endsOn < today ? goal.endsOn : today, wd);
  const elapsed = daysTotal ? Math.min(1, daysDone / daysTotal) : 0;
  // working days still ahead inside each month
  const monthDaysLeft = (key: string): number => {
    const first = `${key}-01`;
    const last = new Date(Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)), 0)).toISOString().slice(0, 10);
    const a = [first, goal.startsOn, today].sort()[2];
    const b = [last, goal.endsOn].sort()[0];
    return a > b ? 0 : countWorkDays(a, b, wd);
  };

  const rows = polos
    .map(p => {
      const g = line.get(p.id);
      const target = g && g.target !== null && g.target !== undefined ? g.target : null;
      const monthly = monthlyOf(g, months.length, target);
      // set by hand in the editor (the screen respects them) or just the even split (the screen re-distributes what is left)
      const savedMonthly = parseJson(g?.monthly, null);
      const monthlyCustom = Array.isArray(savedMonthly) && savedMonthly.length === months.length;
      const manualMonthly: Record<string, number> = parseJson(g?.manualMonthly, {});
      const crm = wonBy.get(p.id) || {};
      const auto = Object.values(crm).reduce((t, n) => t + n, 0);
      const carry = g?.manualCount || 0;
      const adjust = carry + months.reduce((t, m) => t + (Number(manualMonthly[m]) || 0), 0);
      const done = auto + adjust;
      const canceled = g?.canceled || 0;
      const missing = target === null ? null : target - done; // negative = above the target
      const pct = pctOf(done, target);
      const byMonth = months.map((m, i) => {
        const mDone = (crm[m] || 0) + (Number(manualMonthly[m]) || 0);
        const mTarget = target === null ? null : monthly[i];
        const mMissing = mTarget === null ? null : mTarget - mDone;
        return { month: m, target: mTarget, done: mDone, missing: mMissing, pct: pctOf(mDone, mTarget), status: statusOf(pctOf(mDone, mTarget)), perDay: perDayOf(mMissing, monthDaysLeft(m)), adjust: Number(manualMonthly[m]) || 0 };
      });
      // where the polo ends up if it keeps the pace so far (only with a target and enough of the period behind us)
      const forecast = target !== null && elapsed >= 0.1 ? Math.round(done / elapsed) : null;
      return {
        poloId: p.id,
        code: p.code,
        name: p.name,
        target,
        auto,
        manual: carry,
        adjust,
        done,
        missing,
        pct,
        status: statusOf(pct),
        perDay: perDayOf(missing, daysLeft),
        expectedPct: target !== null ? Math.round(elapsed * 10000) / 100 : null,
        forecast,
        canceled,
        inCourse: Math.max(0, done - canceled),
        canceledPct: done ? Math.round((canceled / done) * 10000) / 100 : 0,
        monthly,
        monthlyCustom,
        manualMonthly,
        months: byMonth,
        month: monthKey ? byMonth[months.indexOf(monthKey)] : null
      };
    })
    .filter(r => r.target !== null || r.done > 0 || r.canceled > 0)
    .sort((a, b) => {
      const pa = monthKey ? a.month?.pct ?? -1 : a.pct ?? -1;
      const pb = monthKey ? b.month?.pct ?? -1 : b.pct ?? -1;
      return pb - pa || b.done - a.done;
    });

  // the totals add up only the polos that have a target, so "done", "target" and "missing" always agree
  const scoped = rows.filter(r => r.target !== null);
  const sum = (f: (r: typeof rows[number]) => number) => scoped.reduce((t, r) => t + f(r), 0);
  const target = sum(r => r.target || 0);
  const done = sum(r => r.done);
  const missing = target - done;
  const canceled = sum(r => r.canceled);
  const totals = {
    target,
    done,
    missing,
    pct: pctOf(done, target),
    perDay: perDayOf(missing, daysLeft),
    canceled,
    inCourse: Math.max(0, done - canceled),
    canceledPct: done ? Math.round((canceled / done) * 10000) / 100 : 0
  };
  const monthTotals = months.map((m, i) => {
    const t = sum(r => r.months[i].target || 0);
    const d = sum(r => r.months[i].done);
    return { month: m, target: t, done: d, missing: t - d, pct: pctOf(d, t), status: statusOf(pctOf(d, t)), perDay: perDayOf(t - d, monthDaysLeft(m)), daysLeft: monthDaysLeft(m) };
  });
  return {
    periods: periods.map(g => ({ id: g.id, title: g.title, startsOn: g.startsOn, endsOn: g.endsOn })),
    goal: { id: goal.id, title: goal.title, startsOn: goal.startsOn, endsOn: goal.endsOn, workDays: wd, daysLeft, daysTotal, elapsed },
    months,
    month: monthKey,
    rows,
    totals,
    monthTotals,
    // polos without a line yet, so the administration can add them
    available: polos.filter(p => !rows.some(r => r.poloId === p.id)).map(p => ({ id: p.id, code: p.code, name: p.name }))
  };
};

export const poloBoard = async (req: Request, res: Response): Promise<Response> =>
  res.json(await buildPoloBoard(Number(req.query.goalId) || 0, String(req.query.month || "")));

const poloLine = (goalId: number, months: string[], r: any) => {
  const target = int(r.target);
  let monthly: number[] | null = null;
  if (Array.isArray(r.monthly) && r.monthly.length === months.length) monthly = r.monthly.map((v: any) => int(v) || 0);
  else if (target !== null) monthly = distribute(target, months.length);
  const manualMonthly: Record<string, number> = {};
  Object.entries(r.manualMonthly || {}).forEach(([k, v]) => {
    if (months.includes(k) && int(v)) manualMonthly[k] = int(v) as number;
  });
  return {
    goalId,
    poloId: Number(r.poloId),
    target,
    manualCount: int(r.manual) || 0,
    canceled: int(r.canceled) || 0,
    monthly: monthly ? JSON.stringify(monthly) : null,
    manualMonthly: Object.keys(manualMonthly).length ? JSON.stringify(manualMonthly) : null
  };
};

// administration: the working-day rule and the lines of the polos (all of them at once)
export const updatePolos = async (req: Request, res: Response): Promise<Response> => {
  const goal = await load(req.params.id);
  const b = req.body || {};
  if (b.workDays !== undefined) {
    const wd = Number(b.workDays);
    await goal.update({ workDays: wd === 6 || wd === 7 ? wd : 5 });
  }
  if (Array.isArray(b.rows)) {
    const months = monthsOf(goal.startsOn, goal.endsOn);
    const valid = new Set((await Polo.findAll({ attributes: ["id"] })).map(p => p.id));
    await GoalPolo.destroy({ where: { goalId: goal.id } });
    const rows = b.rows.map((r: any) => poloLine(goal.id, months, r)).filter((r: any) => valid.has(r.poloId));
    if (rows.length) await GoalPolo.bulkCreate(rows as any);
  }
  req.query.goalId = String(goal.id);
  return poloBoard(req, res);
};

// administration: one polo (the quick edit on its card)
export const updatePolo = async (req: Request, res: Response): Promise<Response> => {
  const goal = await load(req.params.id);
  const poloId = Number(req.params.poloId);
  if (!(await Polo.findByPk(poloId))) throw new AppError("ERR_NO_POLO_FOUND", 404);
  const months = monthsOf(goal.startsOn, goal.endsOn);
  const previous = await GoalPolo.findOne({ where: { goalId: goal.id, poloId } });
  // a field that is not sent keeps what was saved
  const body = { ...req.body, poloId };
  const merged = {
    target: body.target !== undefined ? body.target : previous?.target ?? null,
    manual: body.manual !== undefined ? body.manual : previous?.manualCount ?? 0,
    canceled: body.canceled !== undefined ? body.canceled : previous?.canceled ?? 0,
    monthly: body.monthly !== undefined ? body.monthly : body.target !== undefined ? null : parseJson(previous?.monthly, null),
    manualMonthly: body.manualMonthly !== undefined ? body.manualMonthly : parseJson(previous?.manualMonthly, {}),
    poloId
  };
  const row = poloLine(goal.id, months, merged);
  if (previous) await previous.update(row as any);
  else await GoalPolo.create(row as any);
  req.query.goalId = String(goal.id);
  return poloBoard(req, res);
};

const norm = (s: string): string =>
  String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s*-\s*ro$/, "").replace(/[^a-z0-9]+/g, " ").trim();

// body: { items: [{ code, name, target, done, canceled }] } — a table pasted from the spreadsheet. A polo is found by its
// code or name and created when it does not exist yet. "done" is the TOTAL the polo has in the period: what the CRM already
// counted is discounted, so the same enrollment is never counted twice.
export const applyPoloImport = async (goal: Goal, items: any[], dryRun: boolean) => {
  const months = monthsOf(goal.startsOn, goal.endsOn);
  const polos = await Polo.findAll();
  const startAt = dayBounds(goal.startsOn).start;
  const endAt = dayBounds(goal.endsOn).end;
  const out: any[] = [];
  for (const [i, it] of items.entries()) {
    const name = String(it.name || "").trim().slice(0, 120);
    const code = String(it.code || "").trim().slice(0, 20) || null;
    const target = int(it.target);
    if (!name || target === null) { out.push({ line: i + 1, status: "error", name }); continue; }
    let polo = polos.find(p => code && p.code === code) || polos.find(p => norm(p.name) === norm(name));
    const status = polo ? "update" : "new";
    if (!dryRun) {
      if (!polo) {
        polo = await Polo.create({ name, code, state: "RO", active: true } as any);
        polos.push(polo);
        // eslint-disable-next-line no-await-in-loop
        await (await import("../services/PoloServices/SyncPoloQueues")).default(polo);
      } else if (code && !polo.code) {
        await polo.update({ code });
      }
      // eslint-disable-next-line no-await-in-loop
      const previous = await GoalPolo.findOne({ where: { goalId: goal.id, poloId: polo.id } });
      const inCrm = await Lead.count({ where: { isHistorical: false, poloId: polo.id, wonAt: { [Op.gte]: startAt, [Op.lte]: endAt } as any } });
      const row = poloLine(goal.id, months, { poloId: polo.id, target, manual: Math.max(0, (int(it.done) || 0) - inCrm), canceled: int(it.canceled) || 0, manualMonthly: parseJson(previous?.manualMonthly, {}) });
      if (previous) await previous.update(row as any);
      else await GoalPolo.create(row as any);
    }
    out.push({ line: i + 1, status, name: polo ? polo.name : name, code: code || polo?.code || null, target, done: int(it.done) || 0, canceled: int(it.canceled) || 0 });
  }
  return { rows: out, created: out.filter(r => r.status === "new").length, updated: out.filter(r => r.status === "update").length, errors: out.filter(r => r.status === "error").length, dryRun };
};

export const importPoloGoals = async (req: Request, res: Response): Promise<Response> => {
  const goal = await load(req.params.id);
  const items: any[] = Array.isArray(req.body.items) ? req.body.items.slice(0, 300) : [];
  return res.json(await applyPoloImport(goal, items, Boolean(req.body.dryRun)));
};
