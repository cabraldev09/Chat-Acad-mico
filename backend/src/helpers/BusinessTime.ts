import { getSetting } from "./AppSettings";
import { dayBounds, getAppTz } from "./AppTime";

export interface BusinessInterval {
  start: string; // "08:00"
  end: string; // "18:00"
}

// Company working hours, in the company timezone. Weekdays are "0" (Sunday) to "6" (Saturday).
export interface BusinessConfig {
  enabled: boolean;
  days: Record<string, BusinessInterval[]>;
}

const workday = [{ start: "08:00", end: "18:00" }];
export const DEFAULT_BUSINESS: BusinessConfig = {
  enabled: false,
  days: { "0": [], "1": workday, "2": workday, "3": workday, "4": workday, "5": workday, "6": [{ start: "08:00", end: "12:00" }] }
};

const toMinutes = (hhmm: string): number => {
  const [h, m] = String(hhmm).split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

export const normalizeBusiness = (raw: any): BusinessConfig => {
  const days: Record<string, BusinessInterval[]> = {};
  for (let d = 0; d < 7; d += 1) {
    const list = Array.isArray(raw?.days?.[String(d)]) ? raw.days[String(d)] : DEFAULT_BUSINESS.days[String(d)];
    days[String(d)] = list
      .filter((i: any) => /^\d{2}:\d{2}$/.test(i?.start) && /^\d{2}:\d{2}$/.test(i?.end) && toMinutes(i.end) > toMinutes(i.start))
      .map((i: any) => ({ start: i.start, end: i.end }));
  }
  return { enabled: !!raw?.enabled, days };
};

let cache: { at: number; value: BusinessConfig } | null = null;

export const getBusinessConfig = async (): Promise<BusinessConfig> => {
  if (cache && Date.now() - cache.at < 30000) return cache.value;
  let value = DEFAULT_BUSINESS;
  try {
    const raw = await getSetting("business_hours", "");
    if (raw) value = normalizeBusiness(JSON.parse(raw));
  } catch (e) {
    value = DEFAULT_BUSINESS;
  }
  cache = { at: Date.now(), value };
  return value;
};

export const resetBusinessCache = (): void => {
  cache = null;
};

const localDay = (date: Date, tz: string) => {
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  const wd = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(date);
  return { ymd, weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(wd) };
};

// Minutes between two instants that fall inside working hours. Without working hours configured it is plain
// elapsed time, so every metric keeps working for companies that never set them up.
export const businessMinutes = (config: BusinessConfig | null, from: Date, to: Date): number => {
  if (!(to.getTime() > from.getTime())) return 0;
  if (!config || !config.enabled) return (to.getTime() - from.getTime()) / 60000;
  const tz = getAppTz();
  let total = 0;
  let cursor = from;
  for (let guard = 0; guard < 400 && cursor.getTime() < to.getTime(); guard += 1) {
    const { ymd, weekday } = localDay(cursor, tz);
    const { start: dayStart, end: dayEnd } = dayBounds(ymd, tz);
    (config.days[String(weekday)] || []).forEach(({ start, end }) => {
      const s = dayStart.getTime() + toMinutes(start) * 60000;
      const e = dayStart.getTime() + toMinutes(end) * 60000;
      total += Math.max(0, Math.min(e, to.getTime()) - Math.max(s, from.getTime()));
    });
    cursor = new Date(dayEnd.getTime() + 1);
  }
  return total / 60000;
};

export const isBusinessNow = (config: BusinessConfig | null, now: Date = new Date()): boolean => {
  if (!config || !config.enabled) return true;
  const tz = getAppTz();
  const { weekday } = localDay(now, tz);
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const minutes = Number(parts.find(p => p.type === "hour")?.value) * 60 + Number(parts.find(p => p.type === "minute")?.value);
  return (config.days[String(weekday)] || []).some(({ start, end }) => minutes >= toMinutes(start) && minutes < toMinutes(end));
};
