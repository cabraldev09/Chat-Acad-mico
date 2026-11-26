import { Op } from "sequelize";

import { getSetting } from "./AppSettings";
import Contact from "../models/Contact";
import Lead from "../models/Lead";

// THE COMMON QUEUE ("fila comum") OF THE CRM.
// A new lead nobody owns yet is visible to every consultant, who "assumes" it (POST /leads/:id/claim): the first one becomes the owner
// (their "carteira") and the lead leaves everybody else's queue. Only leads of the sales funnel are in the queue: a student imported
// from the tutoring, an enrolled student, a lost lead and the history of the phone are never offered to be taken.
// The whole feature is behind the setting `crm_queue_mode` (off by default): with it off nothing here changes what anybody sees.

// the leads that belong to the queue (Sequelize)
export const queueLeadWhere = (): any => ({
  ownerId: { [Op.is]: null },
  enrolledAt: { [Op.is]: null },
  wonAt: { [Op.is]: null },
  lostAt: { [Op.is]: null },
  isHistorical: false,
  onboardingStatus: "none"
});

// the same rule for raw SQL / literals over a Leads row (the alias must be a quoted identifier or a plain one)
export const queueLeadSql = (alias = '"Lead"'): string =>
  `(${alias}."ownerId" IS NULL AND ${alias}."enrolledAt" IS NULL AND ${alias}."wonAt" IS NULL AND ${alias}."lostAt" IS NULL AND ${alias}."isHistorical" = false AND ${alias}."onboardingStatus" = 'none')`;

// the same rule for a lead already loaded
export const isQueueLead = (lead: { ownerId?: number | null; enrolledAt?: any; wonAt?: any; lostAt?: any; isHistorical?: boolean; onboardingStatus?: string | null }): boolean =>
  !lead.ownerId && !lead.enrolledAt && !lead.wonAt && !lead.lostAt && !lead.isHistorical && (lead.onboardingStatus || "none") === "none";

export const isQueueMode = async (): Promise<boolean> => (await getSetting("crm_queue_mode", "false")) === "true";

// A conversation is "of the queue" when nobody attends it yet, it is a private sales chat, and its contact has a lead of the queue or (no lead
// yet, a moment that lasts seconds) is a plain person: never someone of the team, a personal contact or a channel, whose chats stay private.
// (SQL over Tickets, with the alias of the table)
export const queueTicketSql = (alias = '"Ticket"'): string =>
  `(${alias}."userId" IS NULL AND ${alias}."isGroup" = false AND (${alias}."segment" IS NULL OR ${alias}."segment" = 'sales') AND (` +
  `EXISTS (SELECT 1 FROM "Leads" ql WHERE ql."contactId" = ${alias}."contactId" AND ${queueLeadSql("ql")})` +
  ` OR (NOT EXISTS (SELECT 1 FROM "Leads" nl WHERE nl."contactId" = ${alias}."contactId")` +
  ` AND EXISTS (SELECT 1 FROM "Contacts" qc WHERE qc."id" = ${alias}."contactId" AND qc."isStaff" = false AND qc."isPersonal" = false AND qc."kind" = 'person'))))`;

// the same for a contact that has no lead
export const isPlainPerson = (contact: { isStaff?: boolean; isPersonal?: boolean; kind?: string | null } | null | undefined): boolean =>
  !!contact && !contact.isStaff && !contact.isPersonal && (contact.kind || "person") === "person";

export const firstNameOf = (name: string | null | undefined): string => String(name || "").trim().split(/\s+/)[0] || "";

// What a consultant sees of a lead that is still in the queue (before taking it): who it is and what it wants, not the data that only
// the one who attends needs (CPF, documents, notes, e-mail, AI qualification, money). Everything else is read after "Assumir".
const QUEUE_FIELDS = [
  "id", "name", "phone", "city", "state", "courseId", "course", "modality", "entryTerm", "source", "channel", "stageId", "stage",
  "contactId", "contact", "ownerId", "owner", "createdAt", "updatedAt", "score", "firstContactAt", "lastInboundAt", "lastContactAt", "isHistorical"
];
export const redactQueueLead = (lead: any): any => {
  const json = lead && typeof lead.toJSON === "function" ? lead.toJSON() : lead;
  // the screens read these as lists: they come empty, never missing
  const out: any = { inQueue: true, tags: [], payments: [], commercial: null };
  QUEUE_FIELDS.forEach(k => { if (json && json[k] !== undefined) out[k] = json[k]; });
  return out;
};

// With the queue on, a NEW conversation of a person in the queue (no lead yet, or a lead nobody owns) is not handed to anybody by the rotation, by the
// sector's distribution or by "the number's owner answers it": it waits, pending, for the first consultant who assumes it.
export const queueHolds = async (contactId: number): Promise<boolean> => {
  if (!(await isQueueMode())) return false;
  const lead = await Lead.findOne({ where: { contactId }, attributes: ["id", "ownerId", "enrolledAt", "wonAt", "lostAt", "isHistorical", "onboardingStatus"] });
  if (lead) return isQueueLead(lead);
  return isPlainPerson(await Contact.findByPk(contactId, { attributes: ["id", "isStaff", "isPersonal", "kind"] }));
};
