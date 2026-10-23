import { Op, fn, where, col, literal, Filterable, Includeable } from "sequelize";
import { dayBounds } from "../../helpers/AppTime";

import Ticket from "../../models/Ticket";
import Contact from "../../models/Contact";
import sequelize from "../../database";
import Queue from "../../models/Queue";
import User from "../../models/User";
import ShowUserService from "../UserServices/ShowUserService";
import Whatsapp from "../../models/Whatsapp";
import Tag from "../../models/Tag";
import { portable } from "../../helpers/sqlDialect";
import { Role, SEGMENTS_OF, isManagerRole } from "../../helpers/Roles";
import { connectionScopeOf, ticketScopeWhere } from "../../helpers/ConnectionScope";

interface Request {
  searchParam?: string;
  pageNumber?: string;
  status?: string;
  date?: string;
  showAll?: string;
  userId: string;
  withUnreadMessages?: string;
  groups?: string;
  queueIds: number[];
  tagId?: string;
  archived?: string;
  historical?: string;
  // only the total (chip counters): no rows are loaded
  countOnly?: boolean;
  // who is asking: lists follow the same visibility rules as opening a conversation
  role?: Role;
  // administration and coordination only: every sector (not just their own), and the view of one attendant / one connection
  allQueues?: string;
  communities?: string;
  attendantId?: string;
  connectionId?: string;
}

interface Response {
  tickets: Ticket[];
  count: number;
  hasMore: boolean;
}

const ListTicketsService = async ({
  searchParam = "",
  pageNumber = "1",
  queueIds,
  status,
  date,
  showAll,
  userId,
  withUnreadMessages,
  groups,
  tagId,
  archived,
  historical,
  countOnly,
  role,
  allQueues,
  communities,
  attendantId,
  connectionId
}: Request): Promise<Response> => {
  let whereCondition: Filterable["where"] =
    historical === "true"
      ? {}
      : {
          [Op.or]: [{ userId }, { status: "pending" }],
          queueId: { [Op.or]: [queueIds, null] }
        };
  let includeCondition: Includeable[];

  includeCondition = [
    {
      model: Contact,
      as: "contact",
      attributes: ["id", "name", "number", "profilePicUrl", "channel", "isStaff", "isPersonal", "kind", "parentGroupId", "readOnly"],
      // the search filters on the contact's name and number, so the count query must join it too
      required: !!searchParam
    },
    {
      // who is attending: the list shows the attendant's label, also after a reload (not only on live updates)
      model: User,
      as: "user",
      attributes: ["id", "name"],
      required: false
    },
    {
      model: Queue,
      as: "queue",
      attributes: ["id", "name", "color"]
    },
    {
      model: Whatsapp,
      as: "whatsapp",
      attributes: ["name", "channel"]
    },
    {
      model: Tag,
      as: "tags",
      attributes: ["id", "name", "color"],
      through: { attributes: [] },
      required: !!tagId
        ? true
        : false,
      ...(tagId ? { where: { id: tagId } } : {})
    }
  ];

  const manager = isManagerRole(role);
  // the whole team in one place: a manager is not limited to the sectors they belong to
  const queueScope: any = manager && allQueues === "true" ? {} : { queueId: { [Op.or]: [queueIds, null] } };

  if (showAll === "true" && historical !== "true") {
    whereCondition = { ...queueScope };
  }

  if (status && historical !== "true") {
    whereCondition = {
      ...whereCondition,
      status
    };
  }

  // communities have their own view; the Grupos filter keeps ordinary groups only
  const communityCond = literal(`EXISTS (SELECT 1 FROM "Contacts" cc WHERE cc."id" = "Ticket"."contactId" AND (cc."kind" = 'community' OR cc."parentGroupId" IS NOT NULL))`);
  const notCommunityCond = literal(`NOT EXISTS (SELECT 1 FROM "Contacts" cc WHERE cc."id" = "Ticket"."contactId" AND cc."kind" = 'community')`);
  if (communities === "only") whereCondition = { [Op.and]: [whereCondition, { isGroup: true }, communityCond] } as any;
  else if (groups === "only") whereCondition = { [Op.and]: [whereCondition, { isGroup: true }, notCommunityCond] } as any;

  // groups live under their own filter so they never bury private chats
  if (groups === "exclude") whereCondition = { ...whereCondition, isGroup: false };

  if (searchParam) {
    const sanitizedSearchParam = searchParam.toLocaleLowerCase().trim();
    const like = `%${sanitizedSearchParam.replace(/[\\%_]/g, m => `\\${m}`)}%`;

    const or: any[] = [
      {
        "$contact.name$": where(fn("LOWER", col("contact.name")), "LIKE", like)
      },
      { "$contact.number$": { [Op.like]: like } }
    ];
    // looking inside messages needs at least 3 letters (shorter than that matches everything and is slow);
    // EXISTS stops at the first hit instead of joining every message of every conversation
    if (sanitizedSearchParam.length >= 3) {
      or.push(
        literal(
          portable(
            `EXISTS (SELECT 1 FROM Messages sm WHERE sm.ticketId = Ticket.id AND sm.isDeleted = false AND LOWER(sm.body) LIKE ${sequelize.escape(like)})`
          )
        )
      );
    }
    whereCondition = { ...whereCondition, [Op.or]: or };
  }

  if (date) {
    whereCondition = {
      ...whereCondition,
      createdAt: {
        [Op.between]: [+dayBounds(date).start, +dayBounds(date).end]
      }
    };
  }

  if (withUnreadMessages === "true") {
    const user = await ShowUserService(userId);
    const userQueueIds = user.queues.map(queue => queue.id);

    whereCondition = {
      ...(manager && showAll === "true" ? {} : { [Op.or]: [{ userId }, { status: "pending" }] }),
      ...(manager && allQueues === "true" ? {} : { queueId: { [Op.or]: [manager && showAll === "true" ? queueIds : userQueueIds, null] } }),
      unreadMessages: { [Op.gt]: 0 }
    };
  }

  // the unread view rebuilt the filter above: the Grupos / private-only choice still applies
  if (withUnreadMessages === "true") {
    if (groups === "only") whereCondition = { ...whereCondition, isGroup: true };
    if (groups === "exclude") whereCondition = { ...whereCondition, isGroup: false };
  }

  // channels (newsletters) and similar feeds are not conversations
  whereCondition = {
    [Op.and]: [whereCondition, literal(`NOT EXISTS (SELECT 1 FROM "Contacts" kc WHERE kc."id" = "Ticket"."contactId" AND kc."kind" = 'channel')`)]
  } as any;

  // a manager can look at one attendant's conversations or one connection's
  if (manager && Number(attendantId)) whereCondition = { [Op.and]: [whereCondition, { userId: Number(attendantId) }] } as any;
  if (manager && Number(connectionId)) whereCondition = { [Op.and]: [whereCondition, { whatsappId: Number(connectionId) }] } as any;

  // archived conversations only show in their own view
  whereCondition = {
    [Op.and]: [whereCondition, { archivedAt: archived === "true" ? { [Op.ne]: null } : { [Op.is]: null } }]
  } as any;

  // the consultant and the tutor must not see each other's conversations, not even in the list:
  // own conversations plus the ones still waiting for someone (coordination also reads colleagues')
  if (role && !isManagerRole(role)) {
    const me = Number(userId);
    const segments = SEGMENTS_OF[role] || [];
    const bySegment: any[] = [{ userId: me }, { segment: { [Op.in]: segments } }];
    if (segments.includes("sales")) bySegment.push({ segment: { [Op.is]: null } });
    const scope: any[] = [{ [Op.or]: bySegment }];
    if (role !== "coordenacao") scope.push({ [Op.or]: [{ userId: me }, { userId: { [Op.is]: null } }] });
    whereCondition = { [Op.and]: [whereCondition, ...scope] } as any;
  }

  // groups, communities and private chats follow the connection: nobody reads another number's groups or personal chats
  const byConnection = ticketScopeWhere(await connectionScopeOf(userId, role), userId);
  if (byConnection) whereCondition = { [Op.and]: [whereCondition, byConnection] } as any;

  // pins come first: the ones this person made in the system, and the ones pinned on the phone's WhatsApp
  const pinnedSql = literal(
    portable(`(EXISTS (SELECT 1 FROM TicketPins tp WHERE tp.ticketId = Ticket.id AND tp.userId = ${Number(userId) || 0}) OR Ticket.waPinned = TRUE)`)
  );

  const limit = 40;
  const offset = limit * (+pageNumber - 1);

  // History (conversations copied from the phone) has its own view, and only the administrator and the person
  // who owns the number may open it: it is that person's personal chat history. "all" is the WhatsApp-like view:
  // every live conversation plus the history the person is allowed to see, newest first, pinned on top.
  let finalWhere: any = { [Op.and]: [whereCondition || {}, { isHistorical: false }] };
  if (historical === "true" || historical === "all") {
    const owned =
      role === "admin"
        ? null
        : (await Whatsapp.findAll({ where: { ownerId: Number(userId) }, attributes: ["id"] })).map(w => w.id);
    const history: any = {
      isHistorical: true,
      // a copied chat with nothing in it (only WhatsApp system lines) is noise; empty groups stay, they are listed on purpose
      [Op.or]: [{ isGroup: true }, { lastMessageId: { [Op.ne]: null } }],
      ...(owned === null ? {} : { whatsappId: { [Op.in]: owned.length ? owned : [0] } }),
      // the Grupos / private-only views apply to the history as well
      ...(groups === "only" ? { isGroup: true } : groups === "exclude" ? { isGroup: false } : {})
    };
    finalWhere =
      historical === "true"
        ? { [Op.and]: [whereCondition || {}, history] }
        : { [Op.or]: [{ [Op.and]: [whereCondition || {}, { isHistorical: false }] }, history] };
  }

  if (countOnly) {
    const total = await Ticket.count({ where: finalWhere as any, include: includeCondition, distinct: true });
    return { tickets: [], count: total, hasMore: false };
  }

  const { count, rows: tickets } = await Ticket.findAndCountAll({
    where: finalWhere as any,
    include: includeCondition,
    distinct: true,
    limit,
    offset,
    attributes: { include: [[pinnedSql, "pinned"]] },
    // the order of the phone: the chat time WhatsApp gives (or our last message, when it is newer or the channel has none); the id settles a tie so pages never repeat a chat
    order: [[pinnedSql, "DESC"], [literal('GREATEST(COALESCE("Ticket"."waChatTimestamp", to_timestamp(0)), COALESCE("Ticket"."lastMessageAt", "Ticket"."updatedAt"))'), "DESC"], ["id", "DESC"]]
  });

  const hasMore = count > offset + tickets.length;

  return {
    tickets,
    count,
    hasMore
  };
};

export default ListTicketsService;
