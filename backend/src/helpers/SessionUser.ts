import { verify } from "jsonwebtoken";
import User from "../models/User";
import authConfig from "../config/auth";
import AppError from "../errors/AppError";
import { roleOf } from "./Roles";

// Read permissions from the database rather than trusting an old JWT.
// Only a bad or revoked token ends the session. When the database does not answer, the request fails with 503 and the person stays
// signed in: an unstable moment of the database must not sign the whole team out at once.
export const sessionUser = async (token: string) => {
  let claims: any;
  try {
    claims = verify(token, authConfig.secret, { algorithms: ["HS256"] }) as any;
  } catch (err) {
    throw new AppError("ERR_SESSION_EXPIRED", 401);
  }
  let user: User | null;
  try {
    user = await User.findByPk(claims.id, { attributes: ["id", "profile", "role", "coordArea", "tokenVersion"] });
  } catch (err) {
    throw new AppError("ERR_SERVICE_UNAVAILABLE", 503);
  }
  if (!user || Number(claims.tokenVersion ?? 0) !== user.tokenVersion) throw new AppError("ERR_SESSION_EXPIRED", 401);
  return { id: String(user.id), profile: user.profile, role: roleOf(user), coordArea: user.coordArea || null };
};
