import { Request, Response, NextFunction } from "express";

import AppError from "../errors/AppError";
import { isManagerRole, roleOf } from "../helpers/Roles";

// Who may connect a WhatsApp of their own by QR Code: the people who talk to leads and students (consultant, tutor, academic,
// relationship). The management adds any connection through POST /whatsapp.
const OWN_QR_ROLES = ["consultor", "tutor", "relacionamento"];

const canConnectOwnQr = (req: Request, _res: Response, next: NextFunction): void => {
  const role = roleOf(req.user || {});
  if (!isManagerRole(role) && !OWN_QR_ROLES.includes(role)) throw new AppError("ERR_NO_PERMISSION", 403);
  return next();
};

export default canConnectOwnQr;
