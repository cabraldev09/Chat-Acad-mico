/**
 * Datas do sistema são armazenadas em timestamptz (instante absoluto) e sempre
 * EXIBIDAS no fuso de Rondônia. Sem isso, Server Components na Vercel (UTC)
 * mostravam 01:58 quando eram 21:58 em Porto Velho.
 */
export const APP_TIME_ZONE = "America/Porto_Velho";

type DateInput = Date | string | null | undefined;

export function formatDateTime(d: DateInput): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: APP_TIME_ZONE,
  }).format(new Date(d));
}

export function formatDate(d: DateInput): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeZone: APP_TIME_ZONE,
  }).format(new Date(d));
}

/** Ano/mês/dia civis no fuso da aplicação (independente do fuso do servidor). */
export function zonedDateParts(now: Date = new Date()): {
  year: number;
  month: number;
  day: number;
} {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(now);
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day") };
}

/** Duas datas pertencem ao mesmo dia civil no fuso da aplicação. */
export function isSameZonedDate(first: DateInput, second: DateInput): boolean {
  if (!first || !second) return false;
  const a = zonedDateParts(new Date(first));
  const b = zonedDateParts(new Date(second));
  return a.year === b.year && a.month === b.month && a.day === b.day;
}

/** Turno local usado para impedir repetição de um aviso no mesmo período. */
export function notificationPeriod(
  now: Date = new Date(),
): "morning" | "afternoon" {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIME_ZONE,
    hourCycle: "h23",
    hour: "numeric",
  }).formatToParts(now);
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  return hour < 12 ? "morning" : "afternoon";
}

export function isSameNotificationPeriod(
  first: DateInput,
  second: DateInput,
): boolean {
  if (!first || !second) return false;
  return (
    isSameZonedDate(first, second) &&
    notificationPeriod(new Date(first)) === notificationPeriod(new Date(second))
  );
}

/** Segunda a sexta, das 08:00 às 17:59, no horário de Rondônia. */
export function isBusinessHours(
  now: Date = new Date(),
  startHour = 8,
  endHour = 18,
): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIME_ZONE,
    weekday: "short",
    hourCycle: "h23",
    hour: "numeric",
  }).formatToParts(now);
  const weekday = parts.find((part) => part.type === "weekday")?.value;
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  return (
    weekday !== "Sat" &&
    weekday !== "Sun" &&
    hour >= startHour &&
    hour < endHour
  );
}

/** Quantidade de dias úteis transcorridos entre dois instantes, no fuso da aplicação. */
export function businessDaysSince(
  from: DateInput,
  until: Date = new Date(),
): number {
  if (!from) return 0;
  const start = zonedDateParts(new Date(from));
  const end = zonedDateParts(until);
  const cursor = new Date(Date.UTC(start.year, start.month - 1, start.day));
  const last = new Date(Date.UTC(end.year, end.month - 1, end.day));
  let days = 0;
  cursor.setUTCDate(cursor.getUTCDate() + 1);
  while (cursor <= last) {
    const weekday = cursor.getUTCDay();
    if (weekday !== 0 && weekday !== 6) days += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

/** Deslocamento do fuso da aplicação em minutos para um instante (Porto Velho = -240, sem horário de verão). */
function zoneOffsetMinutes(at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIME_ZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  }).formatToParts(at);
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return Math.round((asUtc - at.getTime()) / 60_000);
}

/** Instante correspondente a 00:00 do 1º dia do mês corrente no fuso da aplicação. */
export function startOfCurrentMonth(now: Date = new Date()): Date {
  const { year, month } = zonedDateParts(now);
  const naive = Date.UTC(year, month - 1, 1, 0, 0, 0);
  return new Date(naive - zoneOffsetMinutes(new Date(naive)) * 60_000);
}

const RELATIVE_UNITS: Array<{ unit: Intl.RelativeTimeFormatUnit; ms: number }> =
  [
    { unit: "year", ms: 365 * 24 * 60 * 60_000 },
    { unit: "month", ms: 30 * 24 * 60 * 60_000 },
    { unit: "day", ms: 24 * 60 * 60_000 },
    { unit: "hour", ms: 60 * 60_000 },
    { unit: "minute", ms: 60_000 },
  ];

/** "há 5 minutos", "há 3 dias", "agora"; datas nulas viram "nunca". */
export function formatRelativeTime(
  d: DateInput,
  now: Date = new Date(),
): string {
  if (!d) return "nunca";
  const diff = new Date(d).getTime() - now.getTime();
  const abs = Math.abs(diff);
  if (abs < 60_000) return "agora";
  const rtf = new Intl.RelativeTimeFormat("pt-BR", { numeric: "always" });
  for (const { unit, ms } of RELATIVE_UNITS) {
    if (abs >= ms) return rtf.format(Math.round(diff / ms), unit);
  }
  return "agora";
}

/** Dias inteiros decorridos desde a data (0 quando é hoje); null quando não há data. */
export function daysSince(d: DateInput, now: Date = new Date()): number | null {
  if (!d) return null;
  return Math.max(
    0,
    Math.floor((now.getTime() - new Date(d).getTime()) / (24 * 60 * 60_000)),
  );
}
