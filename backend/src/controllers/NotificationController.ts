import { Request, Response } from "express";
import { Op } from "sequelize";

import Notification from "../models/Notification";

// The bell's "Avisos": always the notices of the person who asks (nothing in the request chooses whose)
const me = (req: Request): number => Number(req.user.id);

export const index = async (req: Request, res: Response): Promise<Response> => {
  const onlyUnread = req.query.unread === "1" || req.query.unread === "true";
  const rows = await Notification.findAll({
    where: { userId: me(req), ...(onlyUnread ? { readAt: null } : {}) } as any,
    order: [["createdAt", "DESC"]],
    limit: Math.min(100, Math.max(1, Number(req.query.limit) || 50))
  });
  const unread = await Notification.count({ where: { userId: me(req), readAt: null } as any });
  return res.json({ notifications: rows, unread });
};

export const count = async (req: Request, res: Response): Promise<Response> =>
  res.json({ unread: await Notification.count({ where: { userId: me(req), readAt: null } as any }) });

export const read = async (req: Request, res: Response): Promise<Response> => {
  const [n] = await Notification.update({ readAt: new Date() } as any, { where: { id: Number(req.params.id), userId: me(req), readAt: null } as any });
  return res.json({ updated: n });
};

export const readAll = async (req: Request, res: Response): Promise<Response> => {
  const [n] = await Notification.update({ readAt: new Date() } as any, { where: { userId: me(req), readAt: { [Op.is]: null } } as any });
  return res.json({ updated: n });
};
