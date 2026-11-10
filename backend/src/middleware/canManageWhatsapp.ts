import { Request, Response, NextFunction } from "express";

import AppError from "../errors/AppError";
import Whatsapp from "../models/Whatsapp";
import { isManagerRole, roleOf } from "../helpers/Roles";

// Administrators and coordinators manage every connection; anyone else only the QR Code number or the Instagram account they connected themselves.
const canManageWhatsapp = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  if (isManagerRole(roleOf(req.user || {}))) return next();
  const w = await Whatsapp.findByPk(req.params.whatsappId, { attributes: ["id", "ownerId", "channel"] });
  if (!w) throw new AppError("ERR_NO_WAPP_FOUND", 404);
  if (!w.ownerId || w.ownerId !== Number(req.user.id) || !["whatsapp", "instagram"].includes(w.channel)) {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }
  return next();
};

export default canManageWhatsapp;
