import { verify } from "jsonwebtoken";
import { Response as Res } from "express";

import User from "../../models/User";
import AppError from "../../errors/AppError";
import ShowUserService from "../UserServices/ShowUserService";
import authConfig from "../../config/auth";
import { refreshCookieOptions } from "../../helpers/SendRefreshToken";
import { logger } from "../../utils/logger";
import {
  createAccessToken,
  createRefreshToken
} from "../../helpers/CreateTokens";

interface RefreshTokenPayload {
  id: string;
  tokenVersion: number;
}

interface Response {
  user: User;
  newToken: string;
  refreshToken: string;
}

// Why a renewal was refused, for the log (no personal data: only the reason). A failure of the moment (the database not answering, a
// network error) is NOT a refusal: it is thrown as it is (a 5xx), the cookie stays and the screen tries again; only a login that is really
// gone (signature or validity, version changed by a logout, person removed) ends with 401 and clears the cookie.
export const REFRESH_REFUSED = "ERR_SESSION_EXPIRED";
const refuse = (res: Res, reason: string): never => {
  logger.info(`Sessão não renovada: ${reason}`);
  res.clearCookie("jrt", refreshCookieOptions());
  throw new AppError(REFRESH_REFUSED, 401);
};

export const RefreshTokenService = async (
  res: Res,
  token: string
): Promise<Response> => {
  let decoded: RefreshTokenPayload;
  try {
    decoded = verify(token, authConfig.refreshSecret, { algorithms: ["HS256"] }) as unknown as RefreshTokenPayload;
  } catch (err) {
    return refuse(res, (err as Error).name === "TokenExpiredError" ? "token de renovação vencido" : "token de renovação inválido");
  }

  let user: User;
  try {
    user = await ShowUserService(decoded.id);
  } catch (err) {
    if (err instanceof AppError && err.statusCode === 404) return refuse(res, "usuário não existe mais");
    throw err;
  }

  if (user.tokenVersion !== decoded.tokenVersion) return refuse(res, "versão do token mudou (saída em outro aparelho ou aba)");

  const newToken = createAccessToken(user);
  const refreshToken = createRefreshToken(user);

  return { user, newToken, refreshToken };
};
