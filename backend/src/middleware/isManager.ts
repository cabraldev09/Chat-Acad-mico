import { Request, Response, NextFunction } from "express";
import AppError from "../errors/AppError";
import { isManagerRole, roleOf } from "../helpers/Roles";

// Administrators and coordinators manage the team and the CRM setup. What stays with the administrator alone
// (payment credentials, API tokens, webhooks, AI keys, deleting data, creating administrators) uses isAdmin.
const isManager = (req: Request, res: Response, next: NextFunction): void => {
  if (!isManagerRole(roleOf(req.user || {}))) {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }
  return next();
};

export default isManager;
