import { Op, QueryTypes } from "sequelize";

import sequelize from "../../database";
import AppError from "../../errors/AppError";
import { getSetting } from "../../helpers/AppSettings";
import { monthStartApp, todayInAppTz } from "../../helpers/AppTime";
import { isManagerRole, roleOf } from "../../helpers/Roles";
import SendRelease from "../../models/SendRelease";
import User from "../../models/User";

// The quota of sends of each person in the month: how many messages their campaigns and notices may send (Operação e custos → Limites,
// 200 by default; 0 = no limit). Past it, the person asks the management for more (SendReleases); what is approved adds to that month.
// The management (administrators and coordinators) has no quota: they are the ones who approve.

export const DEFAULT_SEND_QUOTA = 200;

export interface SendQuota {
  limited: boolean; // false: a manager, or the quota is off
  quota: number; // the monthly quota of the setting
  extra: number; // what the management approved this month
  used: number; // messages already sent or on the way this month
  left: number | null; // null when not limited
  month: string;
  pending: { id: number; requested: number; createdAt: Date } | null;
}

export const currentMonth = (): string => todayInAppTz().slice(0, 7);

export const quotaSetting = async (): Promise<number> => {
  const n = Number(await getSetting("send_quota_monthly", String(DEFAULT_SEND_QUOTA)));
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : DEFAULT_SEND_QUOTA;
};

// the messages of the person's campaigns (notices included) that went out or are on the way since the first day of the month: the
// recipients still waiting count while the campaign runs (a draft or a paused one does not); the cancelled ones and the ones blocked
// before leaving do not
export const usedThisMonth = async (userIds: number[]): Promise<Map<number, number>> => {
  const out = new Map<number, number>();
  if (!userIds.length) return out;
  const rows = (await sequelize.query(
    `SELECT c."createdById" AS "userId", COUNT(*) AS n FROM "CampaignShippings" s JOIN "Campaigns" c ON c.id = s."campaignId"
      WHERE c."createdById" IN (:ids) AND s."createdAt" >= :since
        AND (s.status IN ('sending', 'sent', 'uncertain') OR (s.status = 'pending' AND c.status = 'running'))
      GROUP BY c."createdById"`,
    { replacements: { ids: userIds, since: monthStartApp() }, type: QueryTypes.SELECT }
  )) as Array<{ userId: number; n: string }>;
  rows.forEach(r => out.set(Number(r.userId), Number(r.n) || 0));
  return out;
};

export const extraThisMonth = async (userIds: number[], month = currentMonth()): Promise<Map<number, number>> => {
  const out = new Map<number, number>();
  if (!userIds.length) return out;
  const rows = await SendRelease.findAll({ where: { userId: { [Op.in]: userIds }, month, status: "approved" }, attributes: ["userId", "granted"] });
  rows.forEach(r => out.set(r.userId, (out.get(r.userId) || 0) + (Number(r.granted) || 0)));
  return out;
};

const managerOf = (user: { role?: string; profile?: string } | null | undefined): boolean => !!user && isManagerRole(roleOf(user as any));

export const quotaOf = async (userId: number, user?: { role?: string; profile?: string } | null): Promise<SendQuota> => {
  const who = user || (await User.findByPk(userId, { attributes: ["id", "role", "profile"] }));
  const month = currentMonth();
  const [quota, used, extra, pending] = await Promise.all([
    quotaSetting(),
    usedThisMonth([userId]).then(m => m.get(userId) || 0),
    extraThisMonth([userId], month).then(m => m.get(userId) || 0),
    SendRelease.findOne({ where: { userId, status: "pending" }, order: [["id", "DESC"]], attributes: ["id", "requested", "createdAt"] })
  ]);
  const limited = !managerOf(who) && quota > 0;
  return {
    limited, quota, extra, used, month,
    left: limited ? Math.max(0, quota + extra - used) : null,
    pending: pending ? { id: pending.id, requested: pending.requested, createdAt: pending.createdAt } : null
  };
};

// Refuses a send of `recipients` messages that would pass the person's quota of the month
export const assertSendQuota = async (userId: number, recipients: number, user?: { role?: string; profile?: string } | null): Promise<SendQuota> => {
  const q = await quotaOf(userId, user);
  if (q.limited && recipients > (q.left as number)) throw new AppError("ERR_SEND_QUOTA", 409);
  return q;
};

// A campaign about to start (or saved to start by itself): the recipients it adds count against its creator's quota. Nothing to check
// when a manager starts it, or when the creator is a manager.
export const assertCampaignQuota = async (ownerId: number | null | undefined, recipients: number, starter?: { role?: string; profile?: string } | null): Promise<void> => {
  if (!ownerId || recipients <= 0 || managerOf(starter)) return;
  await assertSendQuota(Number(ownerId), recipients);
};
