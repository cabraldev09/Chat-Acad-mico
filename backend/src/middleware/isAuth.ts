import { Request, Response, NextFunction } from "express";
import AppError from "../errors/AppError";
import { sessionUser } from "../helpers/SessionUser";
import User from "../models/User";

// "Last access": any authenticated request counts, written at most once a minute per person (a request for each message of the chat must not become a write).
const seen = new Map<number, number>();
const touchSeen = (userId: number): void => {
  const now = Date.now();
  if (now - (seen.get(userId) || 0) < 60000) return;
  seen.set(userId, now);
  User.update({ lastSeenAt: new Date() }, { where: { id: userId }, silent: true } as any).catch(() => undefined);
};

const isAuth = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
  const match = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization || "");
  if (!match) throw new AppError("ERR_SESSION_EXPIRED", 401);
  req.user = await sessionUser(match[1]);
  touchSeen(Number(req.user.id));
  next();
};
export default isAuth;
