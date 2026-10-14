import { randomBytes } from "crypto";
import { Request, Response, NextFunction } from "express";
import { Op } from "sequelize";

import AppError from "../errors/AppError";
import Affiliate from "../models/Affiliate";
import AffiliateAudience from "../models/AffiliateAudience";
import { allowedOrigins } from "./AllowedOrigins";
import { getPublicUrl } from "./PublicUrl";
import { isAdminReq, poloIdsOf, reqRole } from "../middleware/scope";
import { isManagerRole } from "./Roles";

// Letters and digits that cannot be confused when read aloud or typed (no 0/O, 1/I/L)
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

export const newRefCode = async (): Promise<string> => {
  for (let i = 0; i < 20; i += 1) {
    const bytes = randomBytes(6);
    const code = Array.from(bytes, b => ALPHABET[b % ALPHABET.length]).join("");
    // eslint-disable-next-line no-await-in-loop
    if (!(await Affiliate.findOne({ where: { refCode: code }, attributes: ["id"] }))) return code;
  }
  throw new AppError("ERR_INTERNAL_SERVER_ERROR", 500);
};

export const newPortalToken = (): string => randomBytes(24).toString("hex");

// The portal is a page of the web app; the referral form is served by this backend
export const portalUrl = (token: string): string => `${allowedOrigins()[0] || ""}/afiliado/${token}`;
export const referralUrl = (refCode: string): string => `${getPublicUrl()}/r/${refCode}`;

// Who may see which affiliates: admin all; coordination their polos' (and the ones they follow); consultant their own.
// Tutors and academic staff have no access.
export const affiliateScopeWhere = async (req: Request): Promise<any | null> => {
  const role = reqRole(req);
  if (isManagerRole(role)) return null;
  const me = Number(req.user.id);
  if (role === "consultor") return { ownerId: me };
  throw new AppError("ERR_NO_PERMISSION", 403);
};

export const withAffiliateScope = async (req: Request, where: any = {}): Promise<any> => {
  const scope = await affiliateScopeWhere(req);
  return scope ? { [Op.and]: [where, scope] } : where;
};

export const canAccessAffiliate = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
  const where = await withAffiliateScope(req, { id: req.params.id });
  const found = await Affiliate.findOne({ where, attributes: ["id"] });
  if (!found) {
    const exists = await Affiliate.findByPk(req.params.id, { attributes: ["id"] });
    throw new AppError(exists ? "ERR_NO_PERMISSION" : "ERR_AFFILIATE_NOT_FOUND", exists ? 403 : 404);
  }
  next();
};

export const adminOrCoordination = (req: Request): boolean => isAdminReq(req) || reqRole(req) === "coordenacao";

// Material and campaigns are either for everyone ("all") or released to listed consultants / affiliates.
// Returns the ids of the targets this affiliate may see.
export const releasedIds = async (targetType: "material" | "campaign", aff: Affiliate): Promise<Set<number>> => {
  const or: any[] = [{ affiliateId: aff.id }];
  if (aff.ownerId) or.push({ ownerId: aff.ownerId });
  const rows = await AffiliateAudience.findAll({ where: { targetType, [Op.or]: or }, attributes: ["targetId"] });
  return new Set(rows.map(r => r.targetId));
};

export const isVisibleTo = (item: { id: number; audience: string }, released: Set<number>): boolean =>
  item.audience === "all" || released.has(item.id);

export const inWindow = (c: { startsAt?: Date | null; endsAt?: Date | null }, now = new Date()): boolean =>
  (!c.startsAt || new Date(c.startsAt) <= now) && (!c.endsAt || new Date(c.endsAt) >= now);

export const brl = (n: number): string => Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// tutors and academic staff have nothing to do with affiliates
export const affiliateStaff = (req: Request, _res: Response, next: NextFunction): void => {
  if (!["admin", "coordenacao", "consultor"].includes(reqRole(req))) throw new AppError("ERR_NO_PERMISSION", 403);
  next();
};
