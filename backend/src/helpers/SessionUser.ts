import { verify } from "jsonwebtoken";
import User from "../models/User";
import authConfig from "../config/auth";
import AppError from "../errors/AppError";
import { roleOf } from "./Roles";

// Read permissions from the database rather than trusting an old JWT.
export const sessionUser = async (token: string) => {
  try {
    const claims = verify(token, authConfig.secret, { algorithms: ["HS256"] }) as any;
    const user = await User.findByPk(claims.id, { attributes: ["id", "profile", "role", "tokenVersion"] });
    if (!user || Number(claims.tokenVersion ?? 0) !== user.tokenVersion) throw new Error("revoked");
    return { id: String(user.id), profile: user.profile, role: roleOf(user) };
  } catch (err) {
    throw new AppError("ERR_SESSION_EXPIRED", 401);
  }
};
