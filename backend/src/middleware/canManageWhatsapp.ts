import { Request, Response, NextFunction } from "express";

import AppError from "../errors/AppError";
import Whatsapp from "../models/Whatsapp";
import { isManagerRole, roleOf } from "../helpers/Roles";
import { coordinationReachesConnection } from "../helpers/PoloAccess";

// Administrators and coordinators manage every connection. A consultant or tutor reaches only the QR Code number the management gave
// them: they read its QR Code on their own phone, reconnect it and choose which of its groups become conversations.
// The coordination reaches only the connections of people of its polos (helpers/PoloAccess); a connection with no owner is the administration's.
export const connectionInScope = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
  const w = await Whatsapp.findByPk(req.params.whatsappId, { attributes: ["id", "ownerId"] });
  if (!w) throw new AppError("ERR_NO_WAPP_FOUND", 404);
  if (!(await coordinationReachesConnection(req, w.ownerId))) throw new AppError("ERR_NO_PERMISSION", 403);
  return next();
};

const canManageWhatsapp = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  if (isManagerRole(roleOf(req.user || {}))) return connectionInScope(req, res, next);
  const w = await Whatsapp.findByPk(req.params.whatsappId, { attributes: ["id", "ownerId", "channel"] });
  if (!w) throw new AppError("ERR_NO_WAPP_FOUND", 404);
  if (!w.ownerId || w.ownerId !== Number(req.user.id) || (w.channel || "whatsapp") !== "whatsapp") {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }
  return next();
};

export default canManageWhatsapp;
