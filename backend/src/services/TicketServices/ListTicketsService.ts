import { Op, fn, where, col, literal, Filterable, Includeable } from "sequelize";
import { dayBounds } from "../../helpers/AppTime";

import Ticket from "../../models/Ticket";
import Contact from "../../models/Contact";
import sequelize from "../../database";
import Queue from "../../models/Queue";
import ShowUserService from "../UserServices/ShowUserService";
import Whatsapp from "../../models/Whatsapp";
import Tag from "../../models/Tag";
import { portable } from "../../helpers/sqlDialect";
import { Role, SEGMENTS_OF } from "../../helpers/Roles";

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
  role
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
      attributes: ["id", "name", "number", "profilePicUrl", "channel"],
      // the search filters on the contact's name and number, so the count query must join it too
      required: !!searchParam
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

  if (showAll === "true" && historical !== "true") {
    whereCondition = { queueId: { [Op.or]: [queueIds, null] } };
  }

  if (status && historical !== "true") {
    whereCondition = {
      ...whereCondition,
      status
    };
  }

  // groups live under their own filter so they never bury private chats
  if (groups === "only") whereCondition = { ...whereCondition, isGroup: true };
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
      createdAt: {
        [Op.between]: [+dayBounds(date).start, +dayBounds(date).end]
      }
    };
  }

  if (withUnreadMessages === "true") {
    const user = await ShowUserService(userId);
    const userQueueIds = user.queues.map(queue => queue.id);

    whereCondition = {
      [Op.or]: [{ userId }, { status: "pending" }],
      queueId: { [Op.or]: [userQueueIds, null] },
      unreadMessages: { [Op.gt]: 0 }
    };
  }

  // the unread view rebuilt the filter above: the Grupos / private-only choice still applies
  if (withUnreadMessages === "true") {
    if (groups === "only") whereCondition = { ...whereCondition, isGroup: true };
    if (groups === "exclude") whereCondition = { ...whereCondition, isGroup: false };
  }

  // archived conversations only show in their own view
  whereCondition = {
    [Op.and]: [whereCondition, { archivedAt: archived === "true" ? { [Op.ne]: null } : { [Op.is]: null } }]
  } as any;

  // the consultant and the tutor must not see each other's conversations, not even in the list:
  // own conversations plus the ones still waiting for someone (coordination also reads colleagues')
  if (role && role !== "admin") {
    const me = Number(userId);
    const segments = SEGMENTS_OF[role] || [];
    const bySegment: any[] = [{ userId: me }, { segment: { [Op.in]: segments } }];
    if (segments.includes("sales")) bySegment.push({ segment: { [Op.is]: null } });
    const scope: any[] = [{ [Op.or]: bySegment }];
    if (role !== "coordenacao") scope.push({ [Op.or]: [{ userId: me }, { userId: { [Op.is]: null } }] });
    whereCondition = { [Op.and]: [whereCondition, ...scope] } as any;
  }

  // this person's pins come first (pins are personal)
  const pinnedSql = literal(
    portable(`EXISTS (SELECT 1 FROM TicketPins tp WHERE tp.ticketId = Ticket.id AND tp.userId = ${Number(userId) || 0})`)
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
    order: [[pinnedSql, "DESC"], [literal('COALESCE("Ticket"."lastMessageAt", "Ticket"."updatedAt")'), "DESC"]]
  });

  const hasMore = count > offset + tickets.length;

  return {
    tickets,
    count,
    hasMore
  };
};

export default ListTicketsService;
