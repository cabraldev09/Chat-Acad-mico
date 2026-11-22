import { Op } from "sequelize";

import Notification from "../../models/Notification";
import User from "../../models/User";
import { getIO } from "../../libs/socket";
import { logger } from "../../utils/logger";

// The notification center: each notice is kept for the person until it is read (the bell, "Avisos") and also arrives live. The same
// dedupeKey never creates a second notice for the same person (a worker that runs every minute does not fill the bell).
export interface NoticeInput {
  kind: string;
  title: string;
  body?: string | null;
  link?: string | null;
  level?: "info" | "warning" | "urgent";
  dedupeKey?: string | null;
}

const clip = (s: any, n: number) => (s === null || s === undefined ? null : String(s).slice(0, n));

export const notify = async (userIds: Array<number | null | undefined>, notice: NoticeInput): Promise<number> => {
  const ids = [...new Set(userIds.map(Number).filter(id => Number.isInteger(id) && id > 0))];
  if (!ids.length) return 0;
  try {
    const rows = ids.map(userId => ({
      userId,
      kind: clip(notice.kind, 40),
      level: notice.level || "info",
      title: clip(notice.title, 160),
      body: clip(notice.body, 400),
      link: clip(notice.link, 200),
      dedupeKey: clip(notice.dedupeKey, 160)
    }));
    let created: Notification[];
    if (notice.dedupeKey) {
      // only the people who did not have this notice yet
      const had = new Set((await Notification.findAll({ where: { userId: ids, dedupeKey: notice.dedupeKey }, attributes: ["userId"] })).map(n => n.userId));
      created = await Notification.bulkCreate(rows.filter(r => !had.has(r.userId)) as any, { ignoreDuplicates: true });
    } else created = await Notification.bulkCreate(rows as any);
    created.filter(n => n.id).forEach(n => getIO().emit("notification", { userId: n.userId, notification: n }));
    return created.length;
  } catch (err) {
    logger.warn(`Aviso não registrado (${notice.kind}): ${(err as Error).message}`);
    return 0;
  }
};

// the administration and the coordination (the management of the team)
export const managerIds = async (): Promise<number[]> =>
  (await User.findAll({ where: { [Op.or]: [{ profile: "admin" }, { role: { [Op.in]: ["admin", "coordenacao"] } }] } as any, attributes: ["id"] })).map(u => u.id);

export const notifyManagers = async (notice: NoticeInput): Promise<number> => notify(await managerIds(), notice);
