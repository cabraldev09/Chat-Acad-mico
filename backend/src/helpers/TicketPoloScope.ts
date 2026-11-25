import { QueryTypes } from "sequelize";

import PoloMember from "../models/PoloMember";
import { portable } from "./sqlDialect";

// Which conversations the coordination and the relationship team see beyond the ones given to them: only those of their polos.
//   coordenacao     a conversation in a queue of one of its polos, or with a contact who is a lead of one of its polos
//   relacionamento  a conversation with a contact who is an ENROLLED student of one of its polos (its queue has no polo)
// A conversation with no polo (a queue with no polo and a contact who is nobody's lead there) stays with the administration, the same
// rule as the leads with no polo (middleware/scope.ts). With no polo in Polos e equipes, none. null = no limit by polo (admin, and the
// consultant and the tutor, who are limited to their own conversations by other rules).
export const ticketPolosOf = async (role: string, userId: number): Promise<number[] | null> =>
  role === "coordenacao" || role === "relacionamento"
    ? (await PoloMember.findAll({ where: { userId }, attributes: ["poloId"] })).map(m => m.poloId)
    : null;

const idList = (polos: number[]): string => {
  const ids = polos.map(Number).filter(n => Number.isInteger(n) && n > 0);
  return ids.length ? ids.join(",") : "0";
};

// SQL condition over a ticket alias (`Ticket` in the Sequelize list, `t` in raw queries). Written in the raw style of the project
// (unquoted, see helpers/sqlDialect); `raw` = for the queries that go through portable() themselves, else it is quoted here.
export const ticketPoloSql = (polos: number[], enrolledOnly: boolean, t = "Ticket", raw = false): string => {
  const ids = idList(polos);
  const byLead = `EXISTS (SELECT 1 FROM Leads pl WHERE pl.contactId = ${t}.contactId AND pl.poloId IN (${ids})${enrolledOnly ? " AND pl.enrolledAt IS NOT NULL" : ""})`;
  const sql = enrolledOnly ? byLead : `(EXISTS (SELECT 1 FROM Queues pq WHERE pq.id = ${t}.queueId AND pq.poloId IN (${ids})) OR ${byLead})`;
  return raw ? sql : portable(sql);
};

export const ticketInPolos = async (ticketId: number | string, polos: number[], enrolledOnly: boolean): Promise<boolean> => {
  if (!polos.length) return false;
  // the database module is loaded on demand: this helper sits under middlewares that the unit tests import without a database
  const sequelize = (await import("../database")).default;
  const rows = await sequelize.query(portable(`SELECT 1 FROM Tickets t WHERE t.id = :id AND ${ticketPoloSql(polos, enrolledOnly, "t", true)} LIMIT 1`), {
    replacements: { id: Number(ticketId) || 0 },
    type: QueryTypes.SELECT
  });
  return rows.length > 0;
};

// contacts: one with a lead of these polos, or with a conversation of these polos
export const contactPoloSql = (polos: number[], enrolledOnly: boolean, c = "Contact", raw = false): string => {
  const ids = idList(polos);
  const byLead = `EXISTS (SELECT 1 FROM Leads pl WHERE pl.contactId = ${c}.id AND pl.poloId IN (${ids})${enrolledOnly ? " AND pl.enrolledAt IS NOT NULL" : ""})`;
  const sql = enrolledOnly ? byLead : `(${byLead} OR EXISTS (SELECT 1 FROM Tickets pt JOIN Queues pq ON pq.id = pt.queueId WHERE pt.contactId = ${c}.id AND pq.poloId IN (${ids})))`;
  return raw ? sql : portable(sql);
};

export const contactInPolos = async (contactId: number | string, polos: number[], enrolledOnly: boolean): Promise<boolean> => {
  if (!polos.length) return false;
  const sequelize = (await import("../database")).default;
  const rows = await sequelize.query(portable(`SELECT 1 FROM Contacts c WHERE c.id = :id AND ${contactPoloSql(polos, enrolledOnly, "c", true)} LIMIT 1`), {
    replacements: { id: Number(contactId) || 0 },
    type: QueryTypes.SELECT
  });
  return rows.length > 0;
};
