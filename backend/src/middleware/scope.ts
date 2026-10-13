import { Request, Response, NextFunction } from "express";
import { Op } from "sequelize";

import AppError from "../errors/AppError";
import Lead from "../models/Lead";
import Payment from "../models/Payment";
import PoloMember from "../models/PoloMember";
import Proposal from "../models/Proposal";
import { roleOf } from "../helpers/Roles";

// What each job role may see of the CRM (leads and what hangs from them):
//   admin        everything
//   coordenacao  leads of their polos (and leads with no polo yet)
//   consultor    their own leads, plus unassigned ones of their polos (the intake queue)
//   tutor/acad.  students of their polos
export const poloIdsOf = async (userId: number): Promise<number[]> =>
  (await PoloMember.findAll({ where: { userId }, attributes: ["poloId"] })).map(m => m.poloId);

export const reqRole = (req: Request): string => roleOf(req.user);

export const isAdminReq = (req: Request): boolean => reqRole(req) === "admin";

// Sequelize `where` for Lead queries; null = no restriction
export const leadScopeWhere = async (req: Request): Promise<any | null> => {
  const role = reqRole(req);
  if (role === "admin") return null;
  const me = Number(req.user.id);
  const polos = await poloIdsOf(me);
  if (role === "coordenacao") {
    return { [Op.or]: [{ poloId: { [Op.in]: polos } }, { poloId: { [Op.is]: null } }] };
  }
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
  return { poloId: { [Op.in]: polos } };
};

export const withLeadScope = async (req: Request, where: any): Promise<any> => {
  const scope = await leadScopeWhere(req);
  return scope ? { [Op.and]: [where, scope] } : where;
};

const assertLead = async (req: Request, leadId: number | string): Promise<void> => {
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
