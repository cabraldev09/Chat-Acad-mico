import { Request, Response, NextFunction } from "express";
import AppError from "../errors/AppError";
import { roleOf } from "../helpers/Roles";

// Only the maintainer (the administrator), never coordination. Guards the credentials and integration
// secrets — payment gateway (Efí), API tokens, webhook secrets, AI provider keys and e-mail/SMTP: reading
// or changing them is the administrator's alone. Coordination still manages the team, the sectors and the
// rest of the CRM (that is isManager); deleting data stays with isAdmin.
const isSystemAdmin = (req: Request, _res: Response, next: NextFunction): void => {
  if (roleOf(req.user || {}) !== "admin") {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }
  return next();
};

export default isSystemAdmin;
