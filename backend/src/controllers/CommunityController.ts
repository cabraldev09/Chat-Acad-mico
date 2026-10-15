import { Request, Response } from "express";
import { Op } from "sequelize";

import Contact from "../models/Contact";
import Ticket from "../models/Ticket";

// The "Comunidades" list of WhatsApp Web: each community with its announcements group and the groups inside it.
// Built from the contacts the number reported (see syncCommunities in the WhatsApp provider); the conversation of each
// group is the latest one it has, so one click opens it.
export const index = async (_req: Request, res: Response): Promise<Response> => {
  const related = await Contact.findAll({
    where: { isGroup: true, [Op.or]: [{ communityRole: { [Op.ne]: null } }, { kind: "community" }] } as any,
    attributes: ["id", "name", "number", "profilePicUrl", "kind", "communityRole", "communityId", "parentGroupId", "readOnly"],
    order: [["name", "ASC"]]
  });
  const ids = related.map(c => c.id);
  const tickets = ids.length
    ? await Ticket.findAll({
        where: { contactId: { [Op.in]: ids }, isGroup: true },
        attributes: ["id", "contactId", "status", "unreadMessages", "lastMessage", "lastMessageAt", "whatsappId"],
        order: [["updatedAt", "DESC"]]
      })
    : [];
  // the latest conversation of each group: an open one first, else the most recent
  const ticketOf = new Map<number, Ticket>();
  tickets.forEach(t => {
    const old = ticketOf.get(t.contactId);
    if (!old || (old.status === "closed" && t.status !== "closed")) ticketOf.set(t.contactId, t);
  });
  const view = (c: Contact) => {
    const t = ticketOf.get(c.id);
    return {
      contactId: c.id,
      name: c.name,
      profilePicUrl: c.profilePicUrl,
      readOnly: !!c.readOnly,
      ticketId: t ? t.id : null,
      status: t ? t.status : null,
      unread: t ? t.unreadMessages || 0 : 0,
      lastMessage: t ? t.lastMessage : null,
      lastMessageAt: t ? t.lastMessageAt : null
    };
  };
  const idOf = (c: Contact) => `${c.number}@g.us`;
  const parents = related.filter(c => c.communityRole === "parent");
  // communities the parent of which is unknown yet (older markings): grouped under a generic entry
  const members = related.filter(c => c.communityRole !== "parent");
  const communities = parents.map(p => {
    const mine = members.filter(m => (m.communityId || m.parentGroupId) === idOf(p));
    const announcement = mine.find(m => m.communityRole === "announcement") || null;
    const groups = mine.filter(m => m.communityRole === "member" || (!m.communityRole && m !== announcement)).map(view);
    const list = [announcement ? view(announcement) : null, ...groups].filter(Boolean) as ReturnType<typeof view>[];
    return {
      id: p.id,
      name: p.name,
      profilePicUrl: p.profilePicUrl,
      unread: list.reduce((n, g) => n + g.unread, 0),
      announcement: announcement ? view(announcement) : null,
      groups
    };
  });
  const placed = new Set<number>();
  communities.forEach(c => {
    if (c.announcement) placed.add(c.announcement.contactId);
    c.groups.forEach(g => placed.add(g.contactId));
  });
  const loose = members.filter(m => !placed.has(m.id));
  if (loose.length) {
    const list = loose.map(view);
    communities.push({ id: 0, name: "Outras comunidades", profilePicUrl: undefined as any, unread: list.reduce((n, g) => n + g.unread, 0), announcement: null, groups: list });
  }
  return res.json({ communities });
};
