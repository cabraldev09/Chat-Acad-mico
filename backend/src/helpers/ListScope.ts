import { QueryTypes } from "sequelize";

import { contactPoloSql } from "./TicketPoloScope";

// WHICH CONTACT LISTS, CAMPAIGNS AND SCHEDULES THE COORDINATION MAY SEE (ESP-001).
// A list has no polo of its own: its scope comes from its people. The coordination sees a list it created, or one whose people are ALL in its
// polos (a lead of one of its polos, or a contact with a conversation in a queue of one of them); a person nobody knows (a pasted number that
// is no contact and no lead) is outside every polo, so only the administration holds it (the same rule as the leads with no polo).
// A campaign follows its list (or its creator). Admin, consultant and tutor keep their own rules (callers only use this for the coordination).
// The same Brazilian mobile number is stored with and without the ninth digit: the match goes by DDD + the last 8 digits.
const PHONE_KEY = (col: string): string => `(CASE WHEN ${col} LIKE '55%' AND length(${col}) IN (12,13) THEN substr(${col}, 3, 2) || right(${col}, 8) ELSE ${col} END)`;
export const CONTACT_KEY_SQL = PHONE_KEY('c."number"');
export const LEAD_KEY_SQL = PHONE_KEY('l."phone"');

export const phoneKeyOf = (raw: string): string => {
  const d = String(raw || "").replace(/\D/g, "");
  return d.startsWith("55") && (d.length === 12 || d.length === 13) ? d.slice(2, 4) + d.slice(-8) : d;
};

const ids = (polos: number[]): string => {
  const list = polos.map(Number).filter(n => Number.isInteger(n) && n > 0);
  return list.length ? list.join(",") : "0";
};

// SQL: is the person (`key` = an expression of the person's phone key) inside these polos?
const personInPolosSql = (key: string, polos: number[]): string =>
  `(EXISTS (SELECT 1 FROM "Contacts" c WHERE ${CONTACT_KEY_SQL} = ${key} AND ${contactPoloSql(polos, false, "c")})` +
  ` OR EXISTS (SELECT 1 FROM "Leads" l WHERE ${LEAD_KEY_SQL} = ${key} AND l."poloId" IN (${ids(polos)})))`;

// SQL over a ContactListItems alias (the list item is inside the polos)
export const itemInPolosSql = (polos: number[], item = "i"): string => personInPolosSql(PHONE_KEY(`${item}."number"`), polos);

// SQL over a ContactLists alias: made by this person, or with people and ALL of them in the polos
export const listVisibleSql = (polos: number[], me: number, list = '"ContactList"'): string =>
  `(${list}."createdById" = ${Number(me) || 0} OR (EXISTS (SELECT 1 FROM "ContactListItems" vi WHERE vi."contactListId" = ${list}."id")` +
  ` AND NOT EXISTS (SELECT 1 FROM "ContactListItems" i WHERE i."contactListId" = ${list}."id" AND NOT ${itemInPolosSql(polos)})))`;

// the numbers (as typed) that are inside the polos
export const numbersInPolos = async (polos: number[], numbers: string[]): Promise<Set<string>> => {
  const sequelize = (await import("../database")).default;
  const byKey = new Map<string, string[]>();
  numbers.forEach(n => {
    const k = phoneKeyOf(n);
    if (k) byKey.set(k, [...(byKey.get(k) || []), n]);
  });
  const keys = [...byKey.keys()];
  const inside = new Set<string>();
  for (let i = 0; i < keys.length; i += 800) {
    const part = keys.slice(i, i + 800);
    // eslint-disable-next-line no-await-in-loop
    const rows = (await sequelize.query(
      `SELECT k FROM (SELECT ${CONTACT_KEY_SQL} AS k FROM "Contacts" c WHERE ${CONTACT_KEY_SQL} IN (:keys) AND ${contactPoloSql(polos, false, "c")}` +
        ` UNION SELECT ${LEAD_KEY_SQL} AS k FROM "Leads" l WHERE ${LEAD_KEY_SQL} IN (:keys) AND l."poloId" IN (${ids(polos)})) x`,
      { replacements: { keys: part }, type: QueryTypes.SELECT }
    )) as Array<{ k: string }>;
    rows.forEach(r => inside.add(r.k));
  }
  const out = new Set<string>();
  byKey.forEach((originals, k) => { if (inside.has(k)) originals.forEach(o => out.add(o)); });
  return out;
};

export const listVisibleTo = async (listId: number | string, polos: number[], me: number): Promise<boolean> => {
  const sequelize = (await import("../database")).default;
  const rows = await sequelize.query(`SELECT 1 FROM "ContactLists" "ContactList" WHERE "ContactList"."id" = :id AND ${listVisibleSql(polos, me)} LIMIT 1`, {
    replacements: { id: Number(listId) || 0 },
    type: QueryTypes.SELECT
  });
  return rows.length > 0;
};
