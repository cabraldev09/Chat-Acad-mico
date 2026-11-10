import { Request, Response } from "express";
import { Op } from "sequelize";

import { QueryTypes } from "sequelize";

import sequelize from "../database";
import AppError from "../errors/AppError";
import ClientError from "../models/ClientError";
import { logger } from "../utils/logger";

const cut = (v: unknown, n: number): string => String(v || "").slice(0, n);

// any signed-in browser reports a screen that failed to draw
export const store = async (req: Request, res: Response): Promise<Response> => {
  const b = req.body || {};
  // the version of the code arrives in its own field; older screens appended it to the route as " @<version>"
  const fromRoute = /\s@([A-Za-z0-9_-]{1,20})$/.exec(String(b.route || ""));
  const build = cut(b.build, 20) || (fromRoute ? fromRoute[1] : "") || null;
  const route = cut(String(b.route || "").replace(/\s@[A-Za-z0-9_-]{1,20}$/, ""), 200);
  try {
    await ClientError.create({
      code: cut(b.code, 20) || "-",
      userId: Number(req.user?.id) || null,
      role: cut(req.user?.role, 30),
      route,
      build,
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

// the same failure many times is one problem: grouped by screen and message, with how often, how many people, which
// versions of the code and whether it was already marked as fixed
export const summary = async (req: Request, res: Response): Promise<Response> => {
  const days = [7, 30, 90].includes(Number(req.query.days)) ? Number(req.query.days) : 30;
  const rows = await sequelize.query(
    `SELECT route, left(message, 160) AS message,
            count(*)::int AS n, count(DISTINCT "userId")::int AS users,
            max("createdAt") AS "lastAt", min("createdAt") AS "firstAt",
            array_remove(array_agg(DISTINCT build), NULL) AS builds,
            bool_and("resolvedAt" IS NOT NULL) AS resolved,
            (array_agg(code ORDER BY "createdAt" DESC))[1] AS code
       FROM "ClientErrors"
      WHERE "createdAt" > now() - make_interval(days => :days)
      GROUP BY route, left(message, 160)
      ORDER BY max("createdAt") DESC
      LIMIT 100`,
    { replacements: { days }, type: QueryTypes.SELECT }
  );
  return res.json(rows);
};

export const resolve = async (req: Request, res: Response): Promise<Response> => {
  const b = req.body || {};
  const route = cut(b.route, 200);
  const message = cut(b.message, 160);
  if (!message) throw new AppError("ERR_INVALID_PARAMETER", 400);
  await sequelize.query(
    `UPDATE "ClientErrors" SET "resolvedAt" = :at, "updatedAt" = now() WHERE route = :route AND left(message, 160) = :message`,
    { replacements: { at: b.resolved === false ? null : new Date(), route, message } }
  );
  return res.json({ ok: true });
};

export const clear = async (req: Request, res: Response): Promise<Response> => {
  await ClientError.destroy({ where: {} });
  return res.status(204).end();
};
