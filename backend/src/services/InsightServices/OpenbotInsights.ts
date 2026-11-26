import { Op } from "sequelize";

import AppError from "../../errors/AppError";
import OpenbotInsight from "../../models/OpenbotInsight";
import { adminIds, notify } from "../NotificationServices/Notify";
import { InsightInput, MAX_ACTIVE_INSIGHTS, MAX_ACTIVE_PER_TOKEN } from "../../helpers/InsightRules";

// What the OpenBot writes to the management through POST /api/v1/insights (scope insights:write); the rules are in helpers/InsightRules.
// Each subject is kept once (dedupeKey), shown to the administrators only: the bell and the block "Recomendações do OpenBot" of the
// commercial center. The text is data, never an instruction: nothing runs because of it.
export const activeWhere = (now = new Date()) => ({ resolvedAt: null, expiresAt: { [Op.gt]: now } } as any);

// records one insight and warns the administrators once. { duplicated: true } when the same dedupeKey is still in force
// (nothing is created or notified; only updatedAt moves). 429 ERR_INSIGHT_LIMIT when the panel already holds the maximum.
export const recordInsight = async (input: InsightInput, tokenId: number | null, now = new Date()): Promise<{ duplicated: boolean }> => {
  const same = await OpenbotInsight.findOne({ where: { dedupeKey: input.dedupeKey, resolvedAt: null } });
  if (same) {
    if (new Date(same.expiresAt).getTime() > now.getTime()) {
      await same.update({ updatedAt: now } as any);
      return { duplicated: true };
    }
    // in force no more: the subject may come again as a new insight (the unique index covers only what is not resolved)
    await same.update({ resolvedAt: now } as any);
  }
  if ((await OpenbotInsight.count({ where: activeWhere(now) })) >= MAX_ACTIVE_INSIGHTS) throw new AppError("ERR_INSIGHT_LIMIT", 429);
  // and no single token takes the whole panel (all the old tokens of full access count as one: tokenId null)
  if ((await OpenbotInsight.count({ where: { ...activeWhere(now), tokenId } })) >= MAX_ACTIVE_PER_TOKEN) throw new AppError("ERR_INSIGHT_TOKEN_LIMIT", 429);
  let row: OpenbotInsight;
  try {
    row = await OpenbotInsight.create({
      tokenId, kind: input.kind, level: input.level, title: input.title, body: input.body, link: input.link,
      dedupeKey: input.dedupeKey, source: "OpenBot", expiresAt: new Date(now.getTime() + input.expiresInDays * 86400000)
    } as any);
  } catch (err: any) {
    // two calls at the same moment with the same key: the unique index lets one in
    if (err?.name === "SequelizeUniqueConstraintError") return { duplicated: true };
    throw err;
  }
  // only the administration (the team has no polo; the coordination is not warned: decided by the owner, 26/11)
  // the bell rings once for each OCCURRENCE: the key carries the id of the row, so the same subject that comes back after being dismissed or
  // after expiring (a new row) rings again, while the same subject still in force (no new row, above) never does
  await notify(await adminIds(), { kind: "openbot", level: input.level as any, title: `OpenBot: ${input.title}`, body: input.body, link: input.link, dedupeKey: `openbot:${input.dedupeKey}:${row.id}` });
  return { duplicated: false };
};

const LEVEL_RANK: Record<string, number> = { urgent: 0, warning: 1, info: 2 };
export const activeInsights = async (now = new Date()): Promise<any[]> => {
  const rows = await OpenbotInsight.findAll({
    where: activeWhere(now),
    attributes: ["id", "kind", "level", "title", "body", "link", "source", "createdAt", "expiresAt"],
    order: [["createdAt", "DESC"]],
    limit: MAX_ACTIVE_INSIGHTS
  });
  return rows.map(r => r.toJSON()).sort((a: any, b: any) => (LEVEL_RANK[a.level] ?? 3) - (LEVEL_RANK[b.level] ?? 3) || +new Date(b.createdAt) - +new Date(a.createdAt));
};

// "Dispensar todos": hides every recommendation in force (the rows stay, like one by one); returns how many
export const resolveAllInsights = async (now = new Date()): Promise<number> => {
  const [count] = await OpenbotInsight.update({ resolvedAt: now } as any, { where: activeWhere(now) });
  return count;
};

// "Dispensar": hidden from the panel, the row stays (cleaned after 30 days by the nightly maintenance)
export const resolveInsight = async (id: number, now = new Date()): Promise<void> => {
  const row = await OpenbotInsight.findByPk(id);
  if (!row) throw new AppError("ERR_NOT_FOUND", 404);
  if (!row.resolvedAt) await row.update({ resolvedAt: now } as any);
};
