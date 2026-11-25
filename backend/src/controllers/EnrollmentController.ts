import { Request, Response } from "express";
import fs from "fs";
import { Op } from "sequelize";

import AppError from "../errors/AppError";
import { dayBounds, getAppTz } from "../helpers/AppTime";
import { countsInGoal, goalTerm } from "../helpers/EntryTerm";
import Course from "../models/Course";
import EnrollmentProof from "../models/EnrollmentProof";
import Goal from "../models/Goal";
import GoalChange from "../models/GoalChange";
import GoalPolo from "../models/GoalPolo";
import Lead from "../models/Lead";
import LeadEnrollment from "../models/LeadEnrollment";
import Polo from "../models/Polo";
import User from "../models/User";
import { crmPolosOf } from "../middleware/scope";
import { proofFilePath, storeProof } from "../services/CommercialServices/EnrollmentProof";

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const uid = (req: Request): number | null => (req.user && req.user.id ? Number(req.user.id) : null);

// the consultant attaches the print of the enrollment: the RGM read comes back to fill the field
export const uploadProof = async (req: Request, res: Response): Promise<Response> => {
  const lead = await Lead.findByPk(req.params.id, { attributes: ["id"] });
  if (!lead) throw new AppError("ERR_LEAD_NOT_FOUND", 404);
  const file = (req as any).file;
  if (!file) throw new AppError("Anexe o print da matrícula.", 400);
  return res.json(await storeProof(lead.id, file, uid(req)));
};

export const proofFile = async (req: Request, res: Response): Promise<void> => {
  const row = await EnrollmentProof.findOne({ where: { id: Number(req.params.proofId), leadId: Number(req.params.id) } });
  const full = row ? proofFilePath(row) : null;
  if (!row || !full) throw new AppError("O print desta matrícula não está mais disponível.", 410);
  res.setHeader("Content-Type", row.mime);
  res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(row.originalName || row.fileName)}`);
  res.setHeader("Cache-Control", "private, no-store");
  fs.createReadStream(full).pipe(res);
};

type GoalSpan = { title: string; start: string; end: string; term?: string | null };

// the polo goals and their periods: an enrollment is "inside the goal" of its polo by the entry term of the student (the same rule of
// the board of goals, helpers/EntryTerm), else by its day inside the period
const goalPeriods = async (): Promise<{ byPolo: Map<number, GoalSpan[]>; knownTerms: Set<string> }> => {
  const goals = await Goal.findAll({ where: { kind: "polo", status: { [Op.notIn]: ["deleted", "archived"] } } as any });
  const all = await Goal.findAll({ where: { kind: "polo" }, attributes: ["entryTerm", "title"] });
  const lines = goals.length ? await GoalPolo.findAll({ where: { goalId: goals.map(g => g.id) } as any, attributes: ["goalId", "poloId"] }) : [];
  const out = new Map<number, GoalSpan[]>();
  lines.forEach(l => {
    const g = goals.find(x => x.id === l.goalId);
    if (!g) return;
    out.set(l.poloId, [...(out.get(l.poloId) || []), { title: g.title, start: String(g.startsOn).slice(0, 10), end: String(g.endsOn).slice(0, 10), term: goalTerm(g) }]);
  });
  return { byPolo: out, knownTerms: new Set(all.map(g => goalTerm(g)).filter(Boolean) as string[]) };
};

export const goalStatusOf = (day: string, periods: GoalSpan[] | undefined, entryTerm?: string | null, knownTerms?: Set<string>): { inGoal: boolean; goal: string | null } => {
  const hit = (periods || []).find(p => countsInGoal({ entryTerm, day }, { term: p.term || null, start: p.start, end: p.end }, knownTerms || new Set()));
  return { inGoal: !!hit, goal: hit ? hit.title : null };
};

// Matrículas realizadas: every enrollment of the period (the first of each lead and the extra courses), with who did it, when, the RGM,
// the print and whether it fell inside the period of the polo's goal
export const index = async (req: Request, res: Response): Promise<Response> => {
  const tz = getAppTz();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: tz });
  const to = String(req.query.to || today);
  const from = String(req.query.from || `${today.slice(0, 8)}01`);
  if (!DAY.test(from) || !DAY.test(to) || from > to) throw new AppError("ERR_INVALID_PERIOD", 400);
  const range = { [Op.gte]: dayBounds(from).start, [Op.lte]: dayBounds(to).end };
  const ownerId = Number(req.query.ownerId) || null;
  // the coordination sees the enrollments of its polos only (middleware/scope): a polo outside them reads as none
  const mine = await crmPolosOf(req);
  const asked = Number(req.query.poloId) || null;
  const polo = mine === null ? (asked ? { poloId: asked } : {}) : { poloId: { [Op.in]: (asked ? mine.filter(id => id === asked) : mine).concat(0) } };

  const firsts = await Lead.findAll({
    where: { isHistorical: false, wonAt: range, ...polo, ...(ownerId ? { ownerId } : {}) } as any,
    attributes: ["id", "name", "rgm", "wonAt", "poloId", "ownerId", "courseId", "entryTerm"], limit: 3000, order: [["wonAt", "DESC"]]
  });
  const extras = await LeadEnrollment.findAll({
    where: { enrolledAt: range, ...polo, ...(ownerId ? { ownerId } : {}) } as any, limit: 3000, order: [["enrolledAt", "DESC"]]
  });
  const leadIds = [...new Set([...firsts.map(l => l.id), ...extras.map(e => e.leadId)])];
  const extraLeads = await Lead.findAll({ where: { id: extras.map(e => e.leadId) } as any, attributes: ["id", "name"] });
  const [polos, users, courses, proofs, periods] = await Promise.all([
    Polo.findAll({ attributes: ["id", "name"] }),
    User.findAll({ attributes: ["id", "name"] }),
    Course.findAll({ attributes: ["id", "name"] }),
    leadIds.length ? EnrollmentProof.findAll({ where: { leadId: leadIds, attachedAt: { [Op.ne]: null } } as any, order: [["id", "DESC"]] }) : Promise.resolve([] as EnrollmentProof[]),
    goalPeriods()
  ]);
  const nameOf = (list: Array<{ id: number; name: string }>, id: number | null) => (id ? list.find(x => x.id === id)?.name || null : null);
  const proofOf = (leadId: number, enrollmentId: number | null) => proofs.find(p => p.leadId === leadId && (p.enrollmentId || null) === enrollmentId)?.id || null;
  const dayOf = (d: Date) => new Date(d).toLocaleDateString("en-CA", { timeZone: tz });
  const rows = [
    ...firsts.map(l => ({ leadId: l.id, enrollmentId: null as number | null, name: l.name, rgm: l.rgm || null, at: l.wonAt, poloId: l.poloId, ownerId: l.ownerId, course: nameOf(courses, l.courseId), entryTerm: (l as any).entryTerm || null })),
    ...extras.map(e => ({ leadId: e.leadId, enrollmentId: e.id, name: extraLeads.find(l => l.id === e.leadId)?.name || "—", rgm: e.rgm || null, at: e.enrolledAt, poloId: e.poloId, ownerId: e.ownerId, course: e.courseName || nameOf(courses, e.courseId), entryTerm: null }))
  ].map(r => ({
    ...r, polo: nameOf(polos, r.poloId), owner: nameOf(users, r.ownerId), proofId: proofOf(r.leadId, r.enrollmentId),
    ...goalStatusOf(dayOf(r.at), r.poloId ? periods.byPolo.get(r.poloId) : undefined, r.entryTerm, periods.knownTerms)
  })).sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  const byPolo = new Map<string, { polo: string; total: number; inGoal: number }>();
  rows.forEach(r => { const k = r.polo || "Sem polo"; const cur = byPolo.get(k) || { polo: k, total: 0, inGoal: 0 }; cur.total += 1; if (r.inGoal) cur.inGoal += 1; byPolo.set(k, cur); });
  return res.json({ from, to, total: rows.length, inGoal: rows.filter(r => r.inGoal).length, withProof: rows.filter(r => r.proofId).length, byPolo: [...byPolo.values()].sort((a, b) => b.total - a.total), rows });
};

// postpones (or brings forward) the end of a goal, keeping who did it, from when to when and why
export const postponeGoal = async (req: Request, res: Response): Promise<Response> => {
  const goal = await Goal.findByPk(req.params.id);
  if (!goal) throw new AppError("ERR_NOT_FOUND", 404);
  const endsOn = String(req.body?.endsOn || "");
  const reason = String(req.body?.reason || "").trim().slice(0, 500);
  if (!DAY.test(endsOn) || endsOn < String(goal.startsOn).slice(0, 10)) throw new AppError("ERR_INVALID_PERIOD", 400);
  if (!reason) throw new AppError("ERR_GOAL_CHANGE_REASON", 400);
  const before = String(goal.endsOn).slice(0, 10);
  if (before === endsOn) return res.json({ goal, changed: false });
  await goal.update({ endsOn } as any);
  await GoalChange.create({ goalId: goal.id, field: "endsOn", fromValue: before, toValue: endsOn, reason, userId: uid(req) } as any);
  return res.json({ goal, changed: true });
};

export const goalChanges = async (req: Request, res: Response): Promise<Response> => {
  const list = await GoalChange.findAll({ where: { goalId: Number(req.params.id) }, order: [["createdAt", "DESC"]], limit: 50 });
  const users = list.length ? await User.findAll({ where: { id: [...new Set(list.map(c => c.userId).filter(Boolean))] } as any, attributes: ["id", "name"] }) : [];
  return res.json(list.map(c => ({ id: c.id, field: c.field, from: c.fromValue, to: c.toValue, reason: c.reason, at: c.createdAt, by: users.find(u => u.id === c.userId)?.name || null })));
};
