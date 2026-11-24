import { Request, Response, NextFunction } from "express";
import AppError from "../errors/AppError";
import { isManagerRole, roleOf } from "../helpers/Roles";

// Changing a person: the management (administrator or coordination) changes anyone of the team; everybody else changes only
// their own profile ("Perfil" in the menu of the user), and then only the name, the phone and the password (see UserController.update).
const canEditUser = (req: Request, _res: Response, next: NextFunction): void => {
  if (isManagerRole(roleOf(req.user || {}))) return next();
  if (req.user && Number(req.params.userId) === Number(req.user.id)) return next();
  throw new AppError("ERR_NO_PERMISSION", 403);
};

export default canEditUser;
