import AppError from "../../errors/AppError";

// The period and the polo asked to GET /api/v1/indicadores, checked (pure: no database).
export const MAX_PERIOD_DAYS = 93;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export interface IndicatorQuery { from: string; to: string; poloId: number | null; tokenPolos: number[] | null }

// a real day of the calendar: "2026-02-31" does not roll over to March, it is refused
export const isRealDay = (v: string): boolean => {
  if (!DAY.test(v)) return false;
  const d = new Date(`${v}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
};

export const cleanIndicatorQuery = (q: any, tokenPolos: number[] | null): IndicatorQuery => {
  const from = String(q?.de || "");
  const to = String(q?.ate || "");
  if (!isRealDay(from) || !isRealDay(to) || from > to) throw new AppError("ERR_INVALID_PERIOD", 400);
  const days = Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400000) + 1;
  if (days > MAX_PERIOD_DAYS) throw new AppError("ERR_API_PERIOD_TOO_LONG", 400);
  let poloId: number | null = null;
  if (q?.polo !== undefined && q?.polo !== "") {
    poloId = Number(q.polo);
    if (!Number.isInteger(poloId) || poloId <= 0) throw new AppError("ERR_INVALID_PARAMETER", 400);
    if (tokenPolos && !tokenPolos.includes(poloId)) throw new AppError("ERR_API_TOKEN_POLO", 403);
  }
  return { from, to, poloId, tokenPolos };
};

