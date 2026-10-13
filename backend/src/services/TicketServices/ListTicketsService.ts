import { Op, fn, where, col, literal, Filterable, Includeable } from "sequelize";
import { dayBounds } from "../../helpers/AppTime";

import Ticket from "../../models/Ticket";
import Contact from "../../models/Contact";
import Message from "../../models/Message";
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
  role
}: Request): Promise<Response> => {
  let whereCondition: Filterable["where"] = {
    [Op.or]: [{ userId }, { status: "pending" }],
    queueId: { [Op.or]: [queueIds, null] }
  };
  let includeCondition: Includeable[];

  includeCondition = [
    {
      model: Contact,
      as: "contact",
      attributes: ["id", "name", "number", "profilePicUrl", "channel"]
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

  if (showAll === "true") {
    whereCondition = { queueId: { [Op.or]: [queueIds, null] } };
  }

  if (status) {
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

    includeCondition = [
      ...includeCondition,
      {
        model: Message,
        as: "messages",
        attributes: ["id", "body"],
        where: {
          body: where(
            fn("LOWER", col("body")),
            "LIKE",
            `%${sanitizedSearchParam}%`
          )
        },
        required: false,
        duplicating: false
      }
    ];

    whereCondition = {
      ...whereCondition,
      [Op.or]: [
        {
          "$contact.name$": where(
            fn("LOWER", col("contact.name")),
            "LIKE",
            `%${sanitizedSearchParam}%`
          )
        },
        { "$contact.number$": { [Op.like]: `%${sanitizedSearchParam}%` } },
        {
          "$message.body$": where(
            fn("LOWER", col("body")),
            "LIKE",
            `%${sanitizedSearchParam}%`
          )
        }
      ]
    };
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

  const { count, rows: tickets } = await Ticket.findAndCountAll({
    where: whereCondition,
    include: includeCondition,
    distinct: true,
    limit,
    offset,
    attributes: { include: [[pinnedSql, "pinned"]] },
    order: [[pinnedSql, "DESC"], ["updatedAt", "DESC"]]
  });

  const hasMore = count > offset + tickets.length;

  return {
    tickets,
    count,
    hasMore
  };
};

export default ListTicketsService;
