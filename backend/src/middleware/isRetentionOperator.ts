import { Request, Response, NextFunction } from "express";
import AppError from "../errors/AppError";
import { canOperateRetention } from "../helpers/Roles";

// The retention area belongs to the maintainer (administrator) and to the academic coordinator (see Roles.canOperateRetention)
const isRetentionOperator = (req: Request, _res: Response, next: NextFunction): void => {
  if (!canOperateRetention(req.user)) throw new AppError("ERR_NO_PERMISSION", 403);
  return next();
};

export default isRetentionOperator;
