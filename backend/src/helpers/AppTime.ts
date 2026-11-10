import Setting from "../models/Setting";

// The database keeps UTC. Everything a person reads or a "day" boundary uses the
// company timezone: Setting "appTimezone", else APP_TIMEZONE, else Rondônia.
export const DEFAULT_TZ = "America/Porto_Velho";

export const BRAZIL_TIMEZONES = [
  "America/Noronha",
  "America/Sao_Paulo",
  "America/Bahia",
  "America/Fortaleza",
  "America/Recife",
  "America/Belem",
  "America/Maceio",
  "America/Araguaina",
  "America/Santarem",
  "America/Cuiaba",
  "America/Campo_Grande",
  "America/Manaus",
  "America/Porto_Velho",
  "America/Boa_Vista",
  "America/Rio_Branco",
  "America/Eirunepe"
];

let cached = process.env.APP_TIMEZONE || DEFAULT_TZ;

export const isValidTz = (tz: string): boolean => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch (e) {
    return false;
  }
};

export const getAppTz = (): string => cached;

export const setAppTz = (tz: string): void => {
  if (isValidTz(tz)) cached = tz;
};

export const loadAppTz = async (): Promise<void> => {
  try {
    const s = await Setting.findOne({ where: { key: "appTimezone" } });
    if (s && s.value) setAppTz(s.value);
  } catch (e) {
    // table may not exist yet (first migration run)
  }
};

const parts = (date: Date, tz: string) => {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).formatToParts(date);
  const g = (t: string) => Number(f.find(p => p.type === t)?.value);
  return { y: g("year"), mo: g("month"), d: g("day"), h: g("hour") % 24, mi: g("minute"), s: g("second") };
};

// minutes to add to UTC to get the wall clock at `date` in `tz` (RO = -240)
export const tzOffsetMinutes = (date: Date = new Date(), tz = getAppTz()): number => {
  const p = parts(date, tz);
  const asUtc = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s);
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
};

export const offsetString = (date: Date = new Date(), tz = getAppTz()): string => {
  const m = tzOffsetMinutes(date, tz);
  const sign = m < 0 ? "-" : "+";
  const a = Math.abs(m);
  return `${sign}${String(Math.floor(a / 60)).padStart(2, "0")}:${String(a % 60).padStart(2, "0")}`;
};

// UTC instant of a wall-clock time in `tz`
const zonedToUtc = (y: number, mo: number, d: number, h: number, mi: number, s: number, ms: number, tz: string): Date => {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s, ms);
  const off = tzOffsetMinutes(new Date(guess), tz);
  return new Date(guess - off * 60000);
};

// Start/end (UTC instants) of a civil day in the company timezone.
// `day` = "YYYY-MM-DD" | Date | undefined (today).
export const dayBounds = (day?: string | Date, tz = getAppTz()): { start: Date; end: Date } => {
  let y: number;
  let mo: number;
  let d: number;
  if (typeof day === "string" && /^\d{4}-\d{2}-\d{2}/.test(day)) {
    [y, mo, d] = day.slice(0, 10).split("-").map(Number);
  } else {
    const p = parts(day instanceof Date ? day : new Date(), tz);
    ({ y, mo, d } = p);
  }
  return {
    start: zonedToUtc(y, mo, d, 0, 0, 0, 0, tz),
    end: zonedToUtc(y, mo, d, 23, 59, 59, 999, tz)
  };
};

export const startOfTodayApp = (): Date => dayBounds().start;

// today as YYYY-MM-DD in the timezone of the company
export const todayInAppTz = (): string => new Date().toLocaleDateString("en-CA", { timeZone: getAppTz() });

export const shiftDays = (date: Date, days: number): Date => new Date(date.getTime() + days * 86400000);

export const fmtDate = (d: Date | string | number, tz = getAppTz()): string =>
  new Date(d).toLocaleDateString("pt-BR", { timeZone: tz });

export const fmtTime = (d: Date | string | number, tz = getAppTz()): string =>
  new Date(d).toLocaleTimeString("pt-BR", { timeZone: tz, hour: "2-digit", minute: "2-digit" });

export const fmtDateTime = (d: Date | string | number, tz = getAppTz()): string =>
  `${fmtDate(d, tz)} ${fmtTime(d, tz)}`;
