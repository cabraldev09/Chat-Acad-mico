// The working-day calendar of the company (Rondônia): weekends plus the national holidays, the holidays of the state and the optional days
// that nobody works (Carnaval and Corpus Christi), plus any day the administration adds. Pure: tested without a database.
export interface Holiday {
  date: string; // YYYY-MM-DD
  name: string;
  kind: "feriado" | "facultativo" | "extra";
}

const pad = (n: number): string => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number): string => `${y}-${pad(m)}-${pad(d)}`;

// Easter Sunday (Meeus/Jones/Butcher algorithm)
export const easterOf = (year: number): string => {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return iso(year, month, day);
};

const shift = (isoDate: string, days: number): string => {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

export const holidaysOfYear = (year: number): Holiday[] => {
  const easter = easterOf(year);
  return [
    { date: iso(year, 1, 1), name: "Confraternização Universal", kind: "feriado" },
    { date: iso(year, 1, 4), name: "Criação do Estado de Rondônia", kind: "feriado" },
    { date: shift(easter, -48), name: "Carnaval (segunda)", kind: "facultativo" },
    { date: shift(easter, -47), name: "Carnaval (terça)", kind: "facultativo" },
    { date: shift(easter, -2), name: "Sexta-feira Santa", kind: "feriado" },
    { date: iso(year, 4, 21), name: "Tiradentes", kind: "feriado" },
    { date: iso(year, 5, 1), name: "Dia do Trabalho", kind: "feriado" },
    { date: shift(easter, 60), name: "Corpus Christi", kind: "facultativo" },
    { date: iso(year, 6, 18), name: "Dia do Evangélico (Rondônia)", kind: "feriado" },
    { date: iso(year, 9, 7), name: "Independência do Brasil", kind: "feriado" },
    { date: iso(year, 10, 12), name: "Nossa Senhora Aparecida", kind: "feriado" },
    { date: iso(year, 11, 2), name: "Finados", kind: "feriado" },
    { date: iso(year, 11, 15), name: "Proclamação da República", kind: "feriado" },
    { date: iso(year, 11, 20), name: "Consciência Negra", kind: "feriado" },
    { date: iso(year, 12, 25), name: "Natal", kind: "feriado" }
  ];
};

// "29/05/2026", "2026-05-29", one per line or separated by comma/semicolon
export const parseExtraDays = (raw: unknown): string[] => {
  const text = Array.isArray(raw) ? raw.join("\n") : String(raw || "");
  const out = new Set<string>();
  for (const part of text.split(/[\n,;]+/)) {
    const t = part.trim();
    let m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    let y = 0, mo = 0, d = 0;
    if (m) { y = Number(m[1]); mo = Number(m[2]); d = Number(m[3]); }
    else if ((m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/))) { d = Number(m[1]); mo = Number(m[2]); y = Number(m[3]); }
    else continue;
    const date = iso(y, mo, d);
    const check = new Date(`${date}T12:00:00Z`);
    if (check.getUTCFullYear() === y && check.getUTCMonth() + 1 === mo && check.getUTCDate() === d) out.add(date);
  }
  return [...out].sort();
};

// the days without work inside [from, to] (the extra days first, so a name typed by the company wins over a built-in one on the same date)
export const holidaysBetween = (from: string, to: string, extra: string[] = []): Holiday[] => {
  const years: number[] = [];
  for (let y = Number(from.slice(0, 4)); y <= Number(to.slice(0, 4)) && years.length < 10; y += 1) years.push(y);
  const byDate = new Map<string, Holiday>();
  extra.forEach(date => byDate.set(date, { date, name: "Dia sem expediente", kind: "extra" }));
  years.flatMap(holidaysOfYear).forEach(h => { if (!byDate.has(h.date)) byDate.set(h.date, h); });
  return [...byDate.values()].filter(h => h.date >= from && h.date <= to).sort((a, b) => a.date.localeCompare(b.date));
};

// 5 = Monday to Friday, 6 = Monday to Saturday, 7 = every day (a company that works every day has no holidays to take out)
export const isWorkDay = (date: string, workDays: number, off: Set<string>): boolean => {
  if (workDays >= 7) return true;
  const dow = new Date(`${date}T12:00:00Z`).getUTCDay();
  if (workDays === 6 ? dow === 0 : dow === 0 || dow === 6) return false;
  return !off.has(date);
};

export const countWorkDays = (from: string, to: string, workDays: number, extra: string[] = []): number => {
  if (from > to) return 0;
  const off = new Set(holidaysBetween(from, to, extra).map(h => h.date));
  let n = 0;
  const cur = new Date(`${from}T12:00:00Z`);
  const end = new Date(`${to}T12:00:00Z`);
  for (let i = 0; cur <= end && i < 4000; i += 1) {
    if (isWorkDay(cur.toISOString().slice(0, 10), workDays, off)) n += 1;
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return n;
};
