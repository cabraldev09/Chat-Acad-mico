import { Request, Response } from "express";

import AppError from "../errors/AppError";
import User from "../models/User";

const parse = (raw: string | null | undefined): Record<string, any> => {
  try {
    const v = raw ? JSON.parse(raw) : {};
    return v && typeof v === "object" ? v : {};
  } catch (e) {
    return {};
  }
};

// Keeps only what the app knows how to use, so a stored value can never grow without limit.
const cleanSound = (input: any) => {
  const contacts: Record<string, string> = {};
  Object.keys(input?.contacts || {})
    .slice(0, 2000)
    .forEach(id => {
      const v = input.contacts[id];
      if (/^\d+$/.test(id) && (v === "alert" || v === "mute")) contacts[id] = v;
    });
  return {
    mode: input?.mode === "alerts" ? "alerts" : "all",
    popup: input?.popup !== false,
    contacts
  };
};

export const show = async (req: Request, res: Response): Promise<Response> => {
  const user = await User.findByPk(req.user.id, { attributes: ["id", "preferences"] });
  if (!user) throw new AppError("ERR_NO_PERMISSION", 403);
  return res.json(parse(user.preferences));
};

export const update = async (req: Request, res: Response): Promise<Response> => {
  const user = await User.findByPk(req.user.id, { attributes: ["id", "preferences"] });
  if (!user) throw new AppError("ERR_NO_PERMISSION", 403);
  const current = parse(user.preferences);
  if (req.body && req.body.sound !== undefined) current.sound = cleanSound(req.body.sound);
  await user.update({ preferences: JSON.stringify(current) });
  return res.json(current);
};
