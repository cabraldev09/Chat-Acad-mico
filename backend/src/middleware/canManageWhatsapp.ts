import { Request, Response, NextFunction } from "express";

import AppError from "../errors/AppError";
import Whatsapp from "../models/Whatsapp";

// Administrators manage every connection; anyone else only the QR Code number they connected themselves.
const canManageWhatsapp = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  if (req.user?.profile === "admin") return next();
  const w = await Whatsapp.findByPk(req.params.whatsappId, { attributes: ["id", "ownerId", "channel"] });
  if (!w) throw new AppError("ERR_NO_WAPP_FOUND", 404);
  if (!w.ownerId || w.ownerId !== Number(req.user.id) || w.channel !== "whatsapp") {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }
  return next();
};

export default canManageWhatsapp;
