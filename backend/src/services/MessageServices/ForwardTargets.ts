import { Request } from "express";
import { Op, literal } from "sequelize";

import Contact from "../../models/Contact";
import Ticket from "../../models/Ticket";
import UserQueue from "../../models/UserQueue";
import { connectionScopeOf, contactScopeWhere } from "../../helpers/ConnectionScope";
import { isManagerRole, roleOf } from "../../helpers/Roles";
import { inMessagingWindow } from "../OutboundServices/Policy";
import { lastInboundAt } from "../OutboundServices/LastInbound";
import ListTicketsService from "../TicketServices/ListTicketsService";

export interface ForwardFlags { windowClosed: boolean; waiting: boolean }

// What the person must know before forwarding to a conversation: the official number outside the 24 h (only a model may go) and a
// conversation still waiting for an attendant (forwarding there takes it).
export const forwardFlags = async (tickets: Ticket[], _userId: number): Promise<Map<number, ForwardFlags>> => {
  const out = new Map<number, ForwardFlags>();
  for (const t of tickets) {
    const channel = (t.whatsapp && t.whatsapp.channel) || "whatsapp";
    // eslint-disable-next-line no-await-in-loop
    const inbound = ["whatsapp_cloud", "instagram", "messenger"].includes(channel) ? await lastInboundAt(t.contactId, t.whatsappId) : null;
    out.set(t.id, {
      windowClosed: !inMessagingWindow(channel, inbound),
      waiting: !t.userId
    });
  }
  return out;
};

const PAGE = 40;

// Where a message can be forwarded: the open and waiting conversations the person may write in (searched on the server, page by page,
// no limit of 40), and the contacts with no open conversation (the forward opens one for them).
export const forwardTargets = async (req: Request, q: string, page = 1) => {
  const userId = Number(req.user.id);
  const role = roleOf(req.user);
  // the management sees every sector (as in Conversas); the others, their own sectors
  const queueIds = isManagerRole(role) ? [] : (await UserQueue.findAll({ where: { userId } })).map(x => x.queueId);
  const search = String(q || "").trim().slice(0, 80);
  const lists = await Promise.all(
    // open: the person's own (a colleague's refuses the send); waiting: the person's sectors, and every sector for the management
    ["open", "pending"].map(status => ListTicketsService({
      searchParam: search || undefined, pageNumber: String(page), status, userId: String(userId), queueIds, role,
      showAll: status === "pending" && isManagerRole(role) ? "true" : "false",
      ...(isManagerRole(role) ? { allQueues: "true" } : {})
    } as any))
  );
  const tickets = [...lists[0].tickets, ...lists[1].tickets];
  const flags = await forwardFlags(tickets, userId);
  const rows = tickets.map(t => ({
    id: t.id,
    name: (t.contact && t.contact.name) || "",
    profilePicUrl: (t.contact && t.contact.profilePicUrl) || null,
    queueName: (t.queue && t.queue.name) || null,
    connectionName: (t.whatsapp && t.whatsapp.name) || null,
    isGroup: !!t.isGroup,
    ...(flags.get(t.id) as ForwardFlags)
  }));

  // the people with no open conversation, only when searching (by name or number) and only the ones the person may see
  let contacts: Array<{ id: number; name: string; number: string; profilePicUrl: string | null }> = [];
  if (search.length >= 2 && page === 1) {
    const scoped = contactScopeWhere(await connectionScopeOf(userId, role), userId);
    const digits = search.replace(/\D/g, "");
    const match: any = { [Op.or]: [{ name: { [Op.iLike]: `%${search}%` } }, ...(digits.length >= 4 ? [{ number: { [Op.like]: `%${digits}%` } }] : [])] };
    // a contact with a live conversation (even one the person does not see) is reached through that conversation, not a new one
    const free = literal(`NOT EXISTS (SELECT 1 FROM "Tickets" lt WHERE lt."contactId" = "Contact"."id" AND lt.status IN ('open', 'pending') AND lt."isHistorical" = false)`);
    const found = await Contact.findAll({
      where: { [Op.and]: [{ isGroup: false }, free, match, ...(scoped ? [scoped] : [])] } as any,
      attributes: ["id", "name", "number", "profilePicUrl"],
      order: [["name", "ASC"]],
      limit: 20
    });
    contacts = found.filter(c => c.number).map(c => ({ id: c.id, name: c.name, number: c.number, profilePicUrl: c.profilePicUrl || null }));
  }
  return { tickets: rows, contacts, hasMore: lists[0].hasMore || lists[1].hasMore, page, pageSize: PAGE };
};
