import { Request, Response } from "express";
import AppError from "../errors/AppError";
import { logger } from "../utils/logger";
import User from "../models/User";
import { disconnectUser } from "../libs/socket";

import AuthUserService from "../services/UserServices/AuthUserService";
import { SendRefreshToken } from "../helpers/SendRefreshToken";
import { refreshCookieOptions } from "../helpers/SendRefreshToken";
import { RefreshTokenService } from "../services/AuthServices/RefreshTokenService";
import { SerializeUser } from "../helpers/SerializeUser";

export const store = async (req: Request, res: Response): Promise<Response> => {
  const { email, password } = req.body;

  const { token, serializedUser, refreshToken } = await AuthUserService({
    email,
    password
  });

  SendRefreshToken(res, refreshToken);

  return res.status(200).json({
    token,
    user: serializedUser
  });
};

export const update = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const token: string = req.cookies.jrt;

  if (!token) {
    logger.info("Sessão não renovada: cookie de renovação ausente (cookie de terceiros bloqueado, vencido ou apagado)");
    throw new AppError("ERR_SESSION_EXPIRED", 401);
  }

  const { user, newToken, refreshToken } = await RefreshTokenService(
    res,
    token
  );

  SendRefreshToken(res, refreshToken);

  // the same person the login hands out (role resolved by roleOf, no internal fields): the screen reads user.role after every reload
  return res.json({ token: newToken, user: SerializeUser(user) });
};

export const remove = async (
  req: Request,
  res: Response
): Promise<Response> => {
  await User.increment("tokenVersion", { where: { id: req.user.id } });
  disconnectUser(Number(req.user.id));
  res.clearCookie("jrt", refreshCookieOptions());

  return res.send();
};
