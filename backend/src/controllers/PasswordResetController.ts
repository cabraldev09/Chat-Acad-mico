import { Request, Response } from "express";

import { checkToken, confirmReset, requestReset } from "../services/AuthServices/PasswordResetService";

// public: the person is locked out, so there is no login
export const forgot = async (req: Request, res: Response): Promise<Response> => {
  // the e-mail goes out in the background and the answer is the same for every address
  await requestReset(String(req.body?.email || ""), req.ip || "");
  return res.status(200).json({ ok: true });
};

export const check = async (req: Request, res: Response): Promise<Response> => res.status(200).json({ valid: await checkToken(String(req.params.token || "")) });

export const reset = async (req: Request, res: Response): Promise<Response> => {
  await confirmReset(String(req.body?.token || ""), String(req.body?.password || ""));
  return res.status(200).json({ ok: true });
};
