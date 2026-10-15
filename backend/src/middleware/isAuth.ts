import { Request, Response, NextFunction } from "express";
import AppError from "../errors/AppError";
import { sessionUser } from "../helpers/SessionUser";

const isAuth = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
  const match = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization || "");
  if (!match) throw new AppError("ERR_SESSION_EXPIRED", 401);
  req.user = await sessionUser(match[1]);
  next();
};
export default isAuth;
