import sequelize from "../database";
import { getAppTz, offsetString } from "./AppTime";

// Raw SQL that runs on both MariaDB and PostgreSQL.
//  * write identifiers as in the model (Tickets, createdAt, avgFirstResponse …);
//    portable() double-quotes the mixed-case ones for PostgreSQL
//  * use the builders below for date maths and boolean sums

export const isPg = (): boolean => sequelize.getDialect() === "postgres";

const TOKENS = /('(?:[^']|'')*')|(:[A-Za-z_]\w*)|\b([A-Za-z_]\w*)\b/g;

export const portable = (sql: string): string =>
  !isPg()
    ? sql
    : sql.replace(TOKENS, (m, str, param, ident) => {
        if (str || param) return m;
        return /[a-z]/.test(ident) && /[A-Z]/.test(ident) ? `"${ident}"` : m;
      });

export const nowSql = (): string => (isPg() ? "NOW()" : "UTC_TIMESTAMP()");

export const diffSeconds = (from: string, to: string): string =>
  isPg() ? `EXTRACT(EPOCH FROM (${to} - ${from}))` : `TIMESTAMPDIFF(SECOND, ${from}, ${to})`;

export const diffMinutes = (from: string, to: string): string =>
  isPg() ? `(EXTRACT(EPOCH FROM (${to} - ${from})) / 60)` : `TIMESTAMPDIFF(MINUTE, ${from}, ${to})`;

export const diffHours = (from: string, to: string): string =>
  isPg() ? `(EXTRACT(EPOCH FROM (${to} - ${from})) / 3600)` : `TIMESTAMPDIFF(HOUR, ${from}, ${to})`;

export const nowMinus = (n: number, unit: "HOUR" | "DAY"): string =>
  isPg()
    ? `(NOW() - INTERVAL '${n} ${unit.toLowerCase()}')`
    : `DATE_SUB(UTC_TIMESTAMP(), INTERVAL ${n} ${unit})`;

// calendar day of a UTC timestamp column, in the company timezone
export const dayOf = (col: string): string =>
  isPg()
    ? `DATE(${col} AT TIME ZONE '${getAppTz()}')`
    : `DATE(CONVERT_TZ(${col}, '+00:00', '${offsetString()}'))`;

export const countIf = (cond: string): string =>
  `SUM(CASE WHEN ${cond} THEN 1 ELSE 0 END)`;
