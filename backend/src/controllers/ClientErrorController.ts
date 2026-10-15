import { Request, Response } from "express";
import { Op } from "sequelize";

import ClientError from "../models/ClientError";
import { logger } from "../utils/logger";

const cut = (v: unknown, n: number): string => String(v || "").slice(0, n);

// any signed-in browser reports a screen that failed to draw
export const store = async (req: Request, res: Response): Promise<Response> => {
  const b = req.body || {};
  try {
    await ClientError.create({
      code: cut(b.code, 20) || "-",
      userId: Number(req.user?.id) || null,
      role: cut(req.user?.role, 30),
      route: cut(b.route, 200),
      message: cut(b.message, 1000),
      stack: cut(b.stack, 2500),
      components: cut(b.components, 1500),
      userAgent: cut(req.headers["user-agent"], 300)
    } as any);
    // keep only the last 90 days
    if (Math.random() < 0.02) await ClientError.destroy({ where: { createdAt: { [Op.lt]: new Date(Date.now() - 90 * 86400000) } } });
  } catch (err) {
    logger.warn(`client-error not saved: ${err}`);
  }
  logger.warn(`[client-error] user=${req.user?.id} route=${cut(b.route, 120)} code=${cut(b.code, 20)} message=${cut(b.message, 300)}`);
  return res.status(204).end();
};

export const index = async (req: Request, res: Response): Promise<Response> => {
  const { code } = req.query as { code?: string };
  const where: any = code ? { code: String(code).toUpperCase().trim() } : {};
  const rows = await ClientError.findAll({ where, order: [["createdAt", "DESC"]], limit: 200 });
  return res.json(rows);
};

export const clear = async (req: Request, res: Response): Promise<Response> => {
  await ClientError.destroy({ where: {} });
  return res.status(204).end();
};
