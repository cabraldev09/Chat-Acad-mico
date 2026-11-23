import { getAppTz } from "./AppTime";

// Raw SQL helpers. The system runs only on PostgreSQL (config/database.ts refuses anything else):
//  * write identifiers as in the model (Tickets, createdAt, avgFirstResponse …); portable() double-quotes the mixed-case ones
//  * use the builders below for date maths and boolean sums

export const isPg = (): boolean => true;

const TOKENS = /('(?:[^']|'')*')|(:[A-Za-z_]\w*)|\b([A-Za-z_]\w*)\b/g;

export const portable = (sql: string): string =>
  sql.replace(TOKENS, (m, str, param, ident) => {
    if (str || param) return m;
    return /[a-z]/.test(ident) && /[A-Z]/.test(ident) ? `"${ident}"` : m;
  });

export const nowSql = (): string => "NOW()";

export const diffSeconds = (from: string, to: string): string => `EXTRACT(EPOCH FROM (${to} - ${from}))`;

export const diffMinutes = (from: string, to: string): string => `(EXTRACT(EPOCH FROM (${to} - ${from})) / 60)`;

export const diffHours = (from: string, to: string): string => `(EXTRACT(EPOCH FROM (${to} - ${from})) / 3600)`;

export const nowMinus = (n: number, unit: "HOUR" | "DAY"): string => `(NOW() - INTERVAL '${n} ${unit.toLowerCase()}')`;

// calendar day of a UTC timestamp column, in the company timezone
export const dayOf = (col: string): string => `DATE(${col} AT TIME ZONE '${getAppTz()}')`;

export const countIf = (cond: string): string =>
  `SUM(CASE WHEN ${cond} THEN 1 ELSE 0 END)`;
