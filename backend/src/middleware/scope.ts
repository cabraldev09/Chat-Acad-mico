import { Request, Response, NextFunction } from "express";
import { Op } from "sequelize";

import AppError from "../errors/AppError";
import Lead from "../models/Lead";
import Payment from "../models/Payment";
import PoloMember from "../models/PoloMember";
import Proposal from "../models/Proposal";
import Queue from "../models/Queue";
import UserQueue from "../models/UserQueue";
import { isManagerRole, roleOf } from "../helpers/Roles";

// What each job role may see of the CRM (leads and what hangs from them):
//   admin, coordenacao  everything (the coordinator manages all polos)
//   consultor    only their own leads (the ones nobody owns are distributed by the management)
//   tutor/acad.  their own leads and the students given to them
export const poloIdsOf = async (userId: number): Promise<number[]> =>
  (await PoloMember.findAll({ where: { userId }, attributes: ["poloId"] })).map(m => m.poloId);

// the polos of a tutor: the ones listed in Polos e equipes plus the ones whose tutoring queue the person belongs to
export const tutorPoloIdsOf = async (userId: number): Promise<number[]> => {
  const direct = await poloIdsOf(userId);
  const queueIds = (await UserQueue.findAll({ where: { userId }, attributes: ["queueId"] })).map(q => q.queueId);
  const viaQueue = queueIds.length ? (await Queue.findAll({ where: { id: queueIds, poloId: { [Op.ne]: null } } as any, attributes: ["poloId"] })).map(q => q.poloId as number) : [];
  return [...new Set([...direct, ...viaQueue])];
};

export const reqRole = (req: Request): string => roleOf(req.user);

// "admin" here means full access: administrators and coordinators (see helpers/Roles.isManagerRole)
export const isAdminReq = (req: Request): boolean => isManagerRole(reqRole(req));

// Sequelize `where` for Lead queries; null = no restriction
export const leadScopeWhere = async (req: Request): Promise<any | null> => {
  const role = reqRole(req);
  if (isManagerRole(role)) return null;
  const me = Number(req.user.id);
  const polos = await poloIdsOf(me);
  // in the CRM each one sees only what is theirs: the consultant the leads they own; the leads nobody owns yet are distributed by
  // the management (the intake queue is not shown to every consultant of the polo)
  if (role === "consultor") return { ownerId: me };
  // the tutor: the leads they own and the students given to them (the students still without a tutor are in Alunos da tutoria)
  if (role === "tutor") return { [Op.or]: [{ ownerId: me }, { onboardingTutorId: me }] };
  // the relationship team follows the students (the ones already enrolled) of every polo, never the sales funnel
  if (role === "relacionamento") return { enrolledAt: { [Op.ne]: null } };
  return { poloId: { [Op.in]: polos } };
};

export const withLeadScope = async (req: Request, where: any): Promise<any> => {
  const scope = await leadScopeWhere(req);
  return scope ? { [Op.and]: [where, scope] } : where;
};

// The tutoring screens (Ambientação, Alunos da tutoria) are where a tutor takes the students still waiting for one: there the tutor
// also sees the students of their polos that nobody took yet. Everywhere else (the CRM) the rule above holds.
export const onboardingScopeWhere = async (req: Request): Promise<any | null> => {
  if (reqRole(req) !== "tutor") return leadScopeWhere(req);
  const me = Number(req.user.id);
  const mine = await tutorPoloIdsOf(me);
  return { [Op.or]: [{ ownerId: me }, { onboardingTutorId: me }, { onboardingTutorId: { [Op.is]: null }, onboardingStatus: { [Op.ne]: "none" }, poloId: { [Op.in]: mine.length ? mine : [0] } }] };
};
export const withOnboardingScope = async (req: Request, where: any): Promise<any> => {
  const scope = await onboardingScopeWhere(req);
  return scope ? { [Op.and]: [where, scope] } : where;
};

export const assertLead = async (req: Request, leadId: number | string, scopeOf = leadScopeWhere): Promise<void> => {
  const scope = await scopeOf(req);
  if (!scope) return;
  const lead = await Lead.findOne({ where: { [Op.and]: [{ id: leadId }, scope] }, attributes: ["id"] });
  if (!lead) {
    const exists = await Lead.findByPk(leadId, { attributes: ["id"] });
    throw new AppError(exists ? "ERR_NO_PERMISSION" : "ERR_LEAD_NOT_FOUND", exists ? 403 : 404);
  }
};

export const canAccessLead = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
  await assertLead(req, req.params.id);
  next();
};
// the actions of the onboarding (start, checklist, access data): the tutor may act on a student of their polo still waiting
export const canAccessOnboarding = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
  await assertLead(req, req.params.id, onboardingScopeWhere);
  next();
};

export const canAccessProposal = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
  if (isAdminReq(req)) return next();
  const p = await Proposal.findByPk(req.params.id, { attributes: ["id", "leadId", "createdBy"] });
  if (!p) throw new AppError("ERR_NOT_FOUND", 404);
  if (p.leadId) await assertLead(req, p.leadId);
  else if (p.createdBy !== Number(req.user.id)) throw new AppError("ERR_NO_PERMISSION", 403);
  return next();
};

export const canAccessPayment = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
  if (isAdminReq(req)) return next();
  const p = await Payment.findByPk(req.params.id, { attributes: ["id", "leadId"] });
  if (!p) throw new AppError("ERR_NOT_FOUND", 404);
  await assertLead(req, p.leadId);
  return next();
};
