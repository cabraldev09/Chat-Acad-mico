import { Request, Response } from "express";
import { randomBytes } from "crypto";
import ApiToken from "../models/ApiToken";
import AppError from "../errors/AppError";

export const index = async (_req: Request, res: Response): Promise<Response> =>
  res.json(await ApiToken.findAll({ order: [["id", "DESC"]] }));

export const store = async (req: Request, res: Response): Promise<Response> => {
  const { name } = req.body;
  if (!name) throw new AppError("ERR_FIELD_REQUIRED_name");
  const token = `wt_${randomBytes(24).toString("hex")}`;
  const row = await ApiToken.create({ name, token });
  // the full token is shown only here, once
  return res.status(201).json({ ...row.toJSON(), token });
};

export const remove = async (req: Request, res: Response): Promise<Response> => {
  const row = await ApiToken.findByPk(req.params.id);
  if (!row) throw new AppError("ERR_NOT_FOUND", 404);
  await row.destroy();
  return res.json({ message: "deleted" });
};
