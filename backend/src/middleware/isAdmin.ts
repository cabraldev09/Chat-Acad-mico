import { Request, Response, NextFunction } from "express";
import AppError from "../errors/AppError";
import { isManagerRole, roleOf } from "../helpers/Roles";

// Coordinators have the same powers as administrators (decided by the company); only the safeguards around
// administrator accounts (creating, promoting or changing an administrator) stay with the administrator.
const isAdmin = (req: Request, res: Response, next: NextFunction): void => {
  if (!isManagerRole(roleOf(req.user || {}))) {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }
  return next();
};

export default isAdmin;
