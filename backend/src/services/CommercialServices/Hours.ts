import { dayBounds, fmtTime, getAppTz } from "../../helpers/AppTime";
import type { BusinessConfig } from "../../helpers/BusinessTime";

// When the team works and when it answers next, in the company timezone (America/Porto_Velho by default).
const localDay = (d: Date): { ymd: string; weekday: number } => {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: getAppTz(), year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" }).formatToParts(d);
  const get = (t: string) => parts.find(p => p.type === t)?.value || "";
  return { ymd: `${get("year")}-${get("month")}-${get("day")}`, weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday")) };
};
const toMin = (hhmm: string): number => {
  const [h, m] = String(hhmm).split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

// the next moment the team starts working (null when the company has no working hours configured)
export const nextOpening = (config: BusinessConfig | null, from: Date = new Date()): Date | null => {
  if (!config || !config.enabled) return null;
  for (let i = 0; i < 9; i += 1) {
    const probe = new Date(from.getTime() + i * 86400000);
    const { ymd, weekday } = localDay(probe);
    const { start } = dayBounds(ymd);
    const intervals = [...(config.days[String(weekday)] || [])].sort((a, b) => toMin(a.start) - toMin(b.start));
    for (const iv of intervals) {
      const t = new Date(start.getTime() + toMin(iv.start) * 60000);
      if (t.getTime() > from.getTime()) return t;
    }
  }
  return null;
};

export const whenText = (at: Date | null, now: Date = new Date()): string | null => {
  if (!at) return null;
  const a = localDay(at).ymd;
  const today = localDay(now).ymd;
  const tomorrow = localDay(new Date(now.getTime() + 86400000)).ymd;
  const hour = fmtTime(at);
  if (a === today) return `hoje às ${hour}`;
  if (a === tomorrow) return `amanhã às ${hour}`;
  const name = new Intl.DateTimeFormat("pt-BR", { timeZone: getAppTz(), weekday: "long" }).format(at);
  return `${name} às ${hour}`;
};


export const ymdOf = (d: Date): string => localDay(d).ymd;

// "today" for the model: it cannot guess the date, and "amanhã" or "semana que vem" must become a real day
export const todayLine = (now: Date = new Date()): string => {
  const weekday = new Intl.DateTimeFormat("pt-BR", { timeZone: getAppTz(), weekday: "long" }).format(now);
  const [y, m, d] = localDay(now).ymd.split("-");
  return `Hoje é ${weekday}, ${d}/${m}/${y} (fuso de Porto Velho). Datas sempre como AAAA-MM-DD.`;
};

const NINE = 9 * 60 * 60000;

// The day the person said they would come back (AAAA-MM-DD from the model), as 09:00 of that day in the company timezone. A day in the past
// or an invalid one is no day (null); further than 90 days is cut to 90.
export const parseFollowUp = (value: string | null | undefined, now: Date = new Date()): Date | null => {
  const m = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const ymd = `${m[1]}-${m[2]}-${m[3]}`;
  if (Number.isNaN(new Date(`${ymd}T12:00:00Z`).getTime()) || new Date(`${ymd}T12:00:00Z`).toISOString().slice(0, 10) !== ymd) return null;
  const at = new Date(dayBounds(ymd).start.getTime() + NINE);
  if (at.getTime() < now.getTime() + 3600000) return null;
  const limit = now.getTime() + 90 * 86400000;
  return at.getTime() > limit ? new Date(dayBounds(localDay(new Date(limit)).ymd).start.getTime() + NINE) : at;
};

// "vou pensar" without a day: the team retakes the contact in two days
export const defaultFollowUp = (now: Date = new Date()): Date => new Date(dayBounds(localDay(new Date(now.getTime() + 2 * 86400000)).ymd).start.getTime() + NINE);
