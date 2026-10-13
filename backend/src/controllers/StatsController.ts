import { Request, Response } from "express";
import { QueryTypes } from "sequelize";
import { startOfDay, endOfDay, subDays, parseISO } from "date-fns";

import sequelize from "../database";

const range = (req: Request) => {
  const to = req.query.to ? endOfDay(parseISO(String(req.query.to))) : endOfDay(new Date());
  const from = req.query.from
    ? startOfDay(parseISO(String(req.query.from)))
    : startOfDay(subDays(new Date(), 29));
  return { from, to };
};

const q = async (sql: string, replacements: Record<string, any>): Promise<any[]> =>
  (await sequelize.query(sql, { replacements, type: QueryTypes.SELECT })) as any[];

export const overview = async (req: Request, res: Response): Promise<Response> => {
  const { from, to } = range(req);
  const queueId = req.query.queueId ? Number(req.query.queueId) : null;
  const userId = req.query.userId ? Number(req.query.userId) : null;
  const rep = { from, to, queueId, userId };
  const filter = `AND (:queueId IS NULL OR t.queueId = :queueId) AND (:userId IS NULL OR t.userId = :userId)`;

  const [totals] = await q(
    `SELECT
       SUM(t.status = 'open') AS open,
       SUM(t.status = 'pending') AS pending,
       SUM(t.status = 'closed') AS closed,
       COUNT(*) AS total
     FROM Tickets t WHERE 1=1 ${filter}`,
    rep
  );

  const [period] = await q(
    `SELECT
       COUNT(*) AS created,
       AVG(TIMESTAMPDIFF(SECOND, t.createdAt, t.firstResponseAt)) AS avgFirstResponse,
       SUM(t.closedAt BETWEEN :from AND :to) AS closedInPeriod,
       AVG(CASE WHEN t.closedAt BETWEEN :from AND :to
                THEN TIMESTAMPDIFF(SECOND, t.createdAt, t.closedAt) END) AS avgResolution
     FROM Tickets t
     WHERE t.createdAt BETWEEN :from AND :to ${filter}`,
    rep
  );

  const perDay = await q(
    `SELECT DATE(t.createdAt) AS day, COUNT(*) AS created
     FROM Tickets t WHERE t.createdAt BETWEEN :from AND :to ${filter}
     GROUP BY DATE(t.createdAt) ORDER BY day`,
    rep
  );
  const closedPerDay = await q(
    `SELECT DATE(t.closedAt) AS day, COUNT(*) AS closed
     FROM Tickets t WHERE t.closedAt BETWEEN :from AND :to ${filter}
     GROUP BY DATE(t.closedAt) ORDER BY day`,
    rep
  );

  const perUser = await q(
    `SELECT u.id, u.name,
       SUM(t.status = 'open') AS open,
       SUM(t.status = 'closed' AND t.closedAt BETWEEN :from AND :to) AS closed,
       COUNT(CASE WHEN t.createdAt BETWEEN :from AND :to THEN 1 END) AS handled,
       AVG(CASE WHEN t.createdAt BETWEEN :from AND :to
                THEN TIMESTAMPDIFF(SECOND, t.createdAt, t.firstResponseAt) END) AS avgFirstResponse
     FROM Users u LEFT JOIN Tickets t ON t.userId = u.id
     WHERE (:userId IS NULL OR u.id = :userId) AND (:queueId IS NULL OR t.queueId = :queueId OR t.id IS NULL)
     GROUP BY u.id, u.name ORDER BY closed DESC`,
    rep
  );

  const perQueue = await q(
    `SELECT COALESCE(qu.name, 'Sem fila') AS name, COALESCE(qu.color, '#9e9e9e') AS color,
            COUNT(*) AS total
     FROM Tickets t LEFT JOIN Queues qu ON qu.id = t.queueId
     WHERE t.createdAt BETWEEN :from AND :to ${filter}
     GROUP BY qu.id, qu.name, qu.color ORDER BY total DESC`,
    rep
  );

  const perChannel = await q(
    `SELECT w.channel AS channel, COUNT(*) AS total
     FROM Tickets t JOIN Whatsapps w ON w.id = t.whatsappId
     WHERE t.createdAt BETWEEN :from AND :to ${filter}
     GROUP BY w.channel ORDER BY total DESC`,
    rep
  );

  const [messages] = await q(
    `SELECT SUM(m.fromMe = 0) AS received, SUM(m.fromMe = 1) AS sent
     FROM Messages m JOIN Tickets t ON t.id = m.ticketId
     WHERE m.createdAt BETWEEN :from AND :to ${filter}`,
    rep
  );

  const perTag = await q(
    `SELECT g.name, g.color, COUNT(*) AS total
     FROM TicketTags tt JOIN Tags g ON g.id = tt.tagId JOIN Tickets t ON t.id = tt.ticketId
     WHERE t.createdAt BETWEEN :from AND :to ${filter}
     GROUP BY g.id, g.name, g.color ORDER BY total DESC`,
    rep
  );

  return res.json({
    range: { from, to },
    totals,
    period,
    messages,
    perDay,
    closedPerDay,
    perUser,
    perQueue,
    perChannel,
    perTag
  });
};

// Real time monitor: everything currently open or waiting
export const live = async (_req: Request, res: Response): Promise<Response> => {
  const tickets = await q(
    `SELECT t.id, t.status, t.lastMessage, t.unreadMessages, t.updatedAt, t.createdAt,
            c.name AS contactName, c.number AS contactNumber, c.profilePicUrl,
            u.id AS userId, u.name AS userName,
            qu.name AS queueName, qu.color AS queueColor,
            w.name AS connectionName, w.channel AS channel,
            TIMESTAMPDIFF(SECOND, t.updatedAt, NOW()) AS idleSeconds,
            TIMESTAMPDIFF(SECOND, t.createdAt, NOW()) AS ageSeconds
     FROM Tickets t
     JOIN Contacts c ON c.id = t.contactId
     LEFT JOIN Users u ON u.id = t.userId
     LEFT JOIN Queues qu ON qu.id = t.queueId
     LEFT JOIN Whatsapps w ON w.id = t.whatsappId
     WHERE t.status IN ('open', 'pending')
     ORDER BY t.status = 'pending' DESC, t.updatedAt ASC
     LIMIT 300`,
    {}
  );
  const connections = await q(
    `SELECT id, name, channel, status FROM Whatsapps ORDER BY id`,
    {}
  );
  return res.json({ tickets, connections, now: new Date() });
};
