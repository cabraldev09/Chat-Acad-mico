import { Op } from "sequelize";

import { getAppTz } from "../helpers/AppTime";
import { getBusinessConfig, isBusinessNow } from "../helpers/BusinessTime";
import { getIO } from "../libs/socket";
import CurricularAnalysis from "../models/CurricularAnalysis";
import User from "../models/User";
import { businessDaysBetween } from "../analysis/Store";
import { frontBase, notify } from "../services/MailServices/Notify";
import { followUpMail } from "../services/MailServices/Templates";
import { logger } from "../utils/logger";

// The result of the commercial service (enrolled or not) is asked 24 hours after the analysis is delivered. What is still
// unanswered is charged again on the business days, once in the morning and once in the afternoon, a limited number of
// times: a live notice to the owner and an e-mail with the list.
const MAX_REMINDERS = 8;

const zoned = (date: Date): { day: string; period: "morning" | "afternoon"; weekday: number; hour: number } => {
  // h23: midnight is hour 0 (with hour12:false some engines answer 24)
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: getAppTz(), year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23", weekday: "short" }).formatToParts(date);
  const get = (t: string) => parts.find(p => p.type === t)?.value || "";
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  const hour = Number(get("hour")) % 24;
  return { day: `${get("year")}-${get("month")}-${get("day")}`, period: hour < 12 ? "morning" : "afternoon", weekday, hour };
};

// the same slot (day + morning/afternoon) is never charged twice
const sameSlot = (a: Date, b: Date): boolean => {
  const x = zoned(a);
  const y = zoned(b);
  return x.day === y.day && x.period === y.period;
};

// reminders go out only in working hours: the ones the company set, or 08:00-18:00 when none were set
const workingNow = async (now: Date): Promise<boolean> => {
  const config = await getBusinessConfig();
  if (config && config.enabled) return isBusinessNow(config, now);
  const { hour } = zoned(now);
  return hour >= 8 && hour < 18;
};

export const runFollowUpOnce = async (now: Date = new Date()): Promise<{ analyses: number; owners: number }> => {
  const today = zoned(now);
  if (today.weekday === 0 || today.weekday === 6) return { analyses: 0, owners: 0 };
  if (!(await workingNow(now))) return { analyses: 0, owners: 0 };

  // what was already charged in the last 3 hours cannot be in this slot again: it is left out in the query, so the
  // first 500 rows are always the ones that still need a notice
  const due = await CurricularAnalysis.findAll({
    where: {
      status: "COMPLETED",
      enrollmentStatus: "PENDING",
      followUpDueAt: { [Op.lte]: now },
      followUpNotificationCount: { [Op.lt]: MAX_REMINDERS },
      [Op.or]: [{ followUpNotifiedAt: null }, { followUpNotifiedAt: { [Op.lt]: new Date(now.getTime() - 3 * 3600000) } }]
    } as any,
    order: [["followUpDueAt", "ASC"]],
    limit: 500
  });
  const pending = due.filter(a => !a.followUpNotifiedAt || !sameSlot(new Date(a.followUpNotifiedAt), now));
  if (!pending.length) return { analyses: 0, owners: 0 };

  const byOwner = new Map<number, CurricularAnalysis[]>();
  pending.forEach(a => byOwner.set(a.userId, [...(byOwner.get(a.userId) || []), a]));
  let notified = 0;
  for (const [userId, list] of byOwner) {
    const ids = list.map(a => a.id);
    // eslint-disable-next-line no-await-in-loop
    const owner = await User.findByPk(userId, { attributes: ["id", "name", "email"] });
    if (!owner) {
      // nobody to tell: stop charging these
      // eslint-disable-next-line no-await-in-loop
      await CurricularAnalysis.update({ followUpNotificationCount: MAX_REMINDERS } as any, { where: { id: ids } });
      continue;
    }
    // claim first (what is marked is never sent again, even if something below fails), then tell the owner
    // eslint-disable-next-line no-await-in-loop
    await CurricularAnalysis.update({ followUpNotifiedAt: now, followUpNotificationCount: (CurricularAnalysis as any).sequelize.literal('"followUpNotificationCount" + 1') } as any, { where: { id: ids } });
    const items = list.map(a => ({ id: a.id, student: a.candidateName || "Candidato sem nome", course: a.courseName || "Curso não identificado", businessDays: businessDaysBetween(a.enrollmentReanalysisAt || a.createdAt, now) }));
    getIO().to(`user:${userId}`).emit("followUp", { userId, count: items.length, items: items.slice(0, 5) });
    notify(owner.email, followUpMail(owner.name, items, `${frontBase()}/analise-curricular`), "follow-up");
    notified += ids.length;
  }
  return { analyses: notified, owners: byOwner.size };
};

const tick = async (): Promise<void> => {
  try {
    await runFollowUpOnce();
  } catch (err) {
    logger.warn(`Follow-up alert tick failed: ${err}`);
  }
};

export const startFollowUpAlert = (): void => {
  setInterval(tick, 10 * 60000);
};
