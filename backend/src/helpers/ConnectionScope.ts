import { Op, literal } from "sequelize";

import Whatsapp from "../models/Whatsapp";
import { isManagerRole } from "./Roles";

// WHICH CONNECTIONS A PERSON MAY SEE INTO. A number belongs to who connected it (Whatsapp.ownerId; no owner = the institution's).
//   groups and communities: only those of the connections the person owns (they are that number's own life, not the sector's);
//   private conversations: not the ones of a number that belongs to somebody else.
// Administration and coordination keep reading everything (as in the Conexões screen).
export interface ConnectionScope {
  all: boolean;
  own: number[];
  others: number[];
}

export const connectionScopeOf = async (userId: number | string, role: string | undefined): Promise<ConnectionScope> => {
  if (isManagerRole(role)) return { all: true, own: [], others: [] };
  const me = Number(userId);
  const owned = await Whatsapp.findAll({ where: { ownerId: { [Op.ne]: null } } as any, attributes: ["id", "ownerId"] });
  return { all: false, own: owned.filter(w => w.ownerId === me).map(w => w.id), others: owned.filter(w => w.ownerId !== me).map(w => w.id) };
};

// the ticket where-clause that applies the scope (the person's own conversations always stay)
export const ticketScopeWhere = (scope: ConnectionScope, userId: number | string): any | null => {
  if (scope.all) return null;
  // the tutoring and support conversations belong to the team's work whichever number they live on; the rule is about sales chats and groups
  const privateOk: any = scope.others.length
    ? { isGroup: false, [Op.or]: [{ segment: { [Op.in]: TEAM_SEGMENTS } }, { whatsappId: { [Op.is]: null } }, { whatsappId: { [Op.notIn]: scope.others } }] }
    : { isGroup: false };
  const groupOk: any = scope.own.length ? { isGroup: true, whatsappId: { [Op.in]: scope.own } } : { id: 0 };
  return { [Op.or]: [{ userId: Number(userId) }, privateOk, groupOk] };
};

// contacts: a group (or community) is listed only when the person owns a connection it lives in
export const contactScopeWhere = (scope: ConnectionScope): any | null => {
  if (scope.all) return null;
  const ids = (scope.own.length ? scope.own : [0]).map(Number).join(",");
  return literal(`("Contact"."isGroup" = false OR EXISTS (SELECT 1 FROM "Tickets" gt WHERE gt."contactId" = "Contact"."id" AND gt."whatsappId" IN (${ids})))`);
};

// the same rule for one ticket already loaded
const TEAM_SEGMENTS = ["onboarding", "support"];

export const ticketVisibleIn = (scope: ConnectionScope, t: { isGroup: boolean; whatsappId: number | null; userId: number | null; segment?: string | null }, userId: number | string): boolean => {
  if (scope.all || t.userId === Number(userId)) return true;
  if (t.isGroup) return !!t.whatsappId && scope.own.includes(t.whatsappId);
  if (t.segment && TEAM_SEGMENTS.includes(t.segment)) return true;
  return !t.whatsappId || !scope.others.includes(t.whatsappId);
};
