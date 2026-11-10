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
//   consultor    their own leads, plus unassigned ones of their polos (the intake queue)
//   tutor/acad.  students of their polos
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
  if (role === "consultor") {
    return {
      [Op.or]: [
        { ownerId: me },
        {
          ownerId: { [Op.is]: null },
          [Op.or]: [{ poloId: { [Op.in]: polos } }, { poloId: { [Op.is]: null } }]
        }
      ]
    };
  }
  // the tutor works the students given to them and the ones still waiting for a tutor in their polos
  if (role === "tutor") {
    const mine = await tutorPoloIdsOf(me);
    return { [Op.or]: [{ onboardingTutorId: me }, { onboardingTutorId: { [Op.is]: null }, onboardingStatus: { [Op.ne]: "none" }, poloId: { [Op.in]: mine.length ? mine : [0] } }] };
  }
  // the relationship team follows the students (the ones already enrolled) of every polo, never the sales funnel
  if (role === "relacionamento") return { enrolledAt: { [Op.ne]: null } };
  return { poloId: { [Op.in]: polos } };
};

export const withLeadScope = async (req: Request, where: any): Promise<any> => {
  const scope = await leadScopeWhere(req);
  return scope ? { [Op.and]: [where, scope] } : where;
};

export const assertLead = async (req: Request, leadId: number | string): Promise<void> => {
  const scope = await leadScopeWhere(req);
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
