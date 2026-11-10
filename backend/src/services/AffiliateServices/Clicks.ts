import crypto from "crypto";
import { Request } from "express";
import { QueryTypes } from "sequelize";

import sequelize from "../../database";
import AffiliateClick from "../../models/AffiliateClick";
import { logger } from "../../utils/logger";

// Link previews (WhatsApp, Telegram, Facebook, search engines, monitors) fetch the page before anyone sees it: they are
// not people and must not count.
const ROBOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegram|skype|discord|slack|linkedin|pinterest|embedly|curl|wget|python-requests|axios|headless|monitor|uptime|lighthouse/i;

export const isRobot = (req: Request): boolean => {
  if (req.method === "HEAD") return true;
  const ua = String(req.headers["user-agent"] || "");
  return !ua || ROBOT.test(ua);
};

const visitorOf = (req: Request): string => {
  const day = new Date().toISOString().slice(0, 10);
  return crypto.createHash("sha256").update(`${req.ip}|${req.headers["user-agent"] || ""}|${day}`).digest("hex");
};

// records one open of the link; it never delays or breaks the page
export const recordClick = (req: Request, affiliateId: number): void => {
  if (isRobot(req)) return;
  AffiliateClick.create({ affiliateId, visitor: visitorOf(req) } as any).catch(err => logger.warn(`affiliate click not recorded: ${(err as Error).message}`));
};

export interface ClickStats {
  total: number;
  unique: number;
  last7: number;
}

// opens of the link of each affiliate: all of them, people (each one counted once a day) and the last 7 days
export const clicksFor = async (ids: number[]): Promise<Map<number, ClickStats>> => {
  const out = new Map<number, ClickStats>();
  ids.forEach(id => out.set(id, { total: 0, unique: 0, last7: 0 }));
  if (!ids.length) return out;
  const rows: any[] = await sequelize.query(
    `SELECT "affiliateId", count(*)::int AS total, count(DISTINCT visitor)::int AS unique,
            count(*) FILTER (WHERE "createdAt" > now() - interval '7 days')::int AS last7
       FROM "AffiliateClicks" WHERE "affiliateId" IN (:ids) GROUP BY "affiliateId"`,
    { replacements: { ids }, type: QueryTypes.SELECT }
  );
  rows.forEach(r => out.set(Number(r.affiliateId), { total: r.total, unique: r.unique, last7: r.last7 }));
  return out;
};
