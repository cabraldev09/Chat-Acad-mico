import Whatsapp from "../../models/Whatsapp";
import Ticket from "../../models/Ticket";
import Message from "../../models/Message";
import TicketPin from "../../models/TicketPin";
import User from "../../models/User";
import AppError from "../../errors/AppError";
import { whatsappProvider } from "../../providers/WhatsApp";
import CreateOrUpdateContactService from "../ContactServices/CreateOrUpdateContactService";
import { logger } from "../../utils/logger";
import { getIO } from "../../libs/socket";

export interface HistoryReport {
  pinned: number;
  chats: number;
  newConversations: number;
  messages: number;
}

const running = new Set<number>();
export const isHistoryRunning = (whatsappId: number): boolean => running.has(whatsappId);

// Copies the conversations that already exist on the phone into the system as HISTORY: readable and
// searchable, but never counted in the dashboards or the CRM, and silent (no automations, no alerts).
// When the person writes again, the conversation comes back to life by itself.
export const importHistory = async (
  connection: Whatsapp,
  options: { perChat?: number; includeGroups?: boolean } = {},
  onProgress?: (done: number, total: number) => void
): Promise<HistoryReport> => {
  if (!whatsappProvider.importChats) throw new AppError("ERR_WAPP_NOT_INITIALIZED");
  if (running.has(connection.id)) throw new AppError("ERR_HISTORY_RUNNING", 409);
  running.add(connection.id);

  const report: HistoryReport = { pinned: 0, chats: 0, newConversations: 0, messages: 0 };

  // the chats pinned on the phone are pinned here too, for the person who owns the number (the administrators
  // when the number belongs to the company)
  const pinFor: number[] = connection.ownerId
    ? [connection.ownerId]
    : (await User.findAll({ where: { profile: "admin" }, attributes: ["id"] })).map(u => u.id);
  const people = new Map<string, number>();
  try {
    await whatsappProvider.importChats(
      connection.id,
      { perChat: Math.min(Math.max(Number(options.perChat) || 60, 10), 300), includeGroups: options.includeGroups !== false },
      async chat => {
        const contact = await CreateOrUpdateContactService({
          name: chat.contact.name,
          number: chat.contact.number,
          lid: chat.contact.lid,
          isGroup: chat.isGroup
        });

        const times = chat.messages.map(m => m.timestamp * 1000).sort((a, b) => a - b);
        const first = new Date(times[0]);
        const last = new Date(times[times.length - 1]);
        const latest = [...chat.messages].sort((a, b) => b.timestamp - a.timestamp)[0];

        let ticket = await Ticket.findOne({
          where: { contactId: contact.id, whatsappId: connection.id },
          order: [["updatedAt", "DESC"]]
        });
        let isNew = false;
        if (!ticket) {
          ticket = await Ticket.create({
            contactId: contact.id,
            whatsappId: connection.id,
            status: "closed",
            isGroup: chat.isGroup,
            unreadMessages: 0,
            isHistorical: true,
            userId: connection.ownerId || null,
            lastMessage: latest.body.slice(0, 1000),
            lastMessageId: latest.id,
            lastMessageFromMe: !!latest.fromMe,
            lastMessageAck: latest.ack || 0,
            closedAt: last,
            createdAt: first
          } as any);
          await Ticket.update({ updatedAt: last }, { where: { id: ticket.id }, silent: true } as any);
          isNew = true;
          report.newConversations += 1;
        }

        // who wrote each message of a group (people are registered as contacts once)
        for (const m of chat.messages) {
          if (!m.author) continue;
          const key = `${m.author.number}|${m.author.lid || ""}`;
          if (!people.has(key)) {
            // eslint-disable-next-line no-await-in-loop
            const person = await CreateOrUpdateContactService({
              name: m.author.name,
              number: m.author.number,
              lid: m.author.lid,
              isGroup: false
            }).catch(() => null);
            if (person) people.set(key, person.id);
          }
        }

        await Message.bulkCreate(
          chat.messages.map(m => ({
            id: m.id,
            ticketId: ticket.id,
            body: m.body,
            fromMe: m.fromMe,
            read: true,
            mediaType: "chat",
            ack: m.ack,
            contactId: m.fromMe ? undefined : (m.author && people.get(`${m.author.number}|${m.author.lid || ""}`)) || contact.id,
            createdAt: new Date(m.timestamp * 1000)
          })) as any,
          { ignoreDuplicates: true }
        );
        if (chat.archived && isNew) {
          await Ticket.update({ archivedAt: last } as any, { where: { id: ticket.id }, silent: true } as any);
        }
        if (chat.pinned) {
          for (const uid of pinFor) {
            // eslint-disable-next-line no-await-in-loop
            await TicketPin.findOrCreate({ where: { userId: uid, ticketId: ticket.id } });
          }
          report.pinned += 1;
        }
        report.messages += chat.messages.length;
        report.chats += 1;
        if (!isNew && ticket.isHistorical) {
          await Ticket.update(
            {
              lastMessage: latest.body.slice(0, 1000),
              lastMessageId: latest.id,
              lastMessageFromMe: !!latest.fromMe,
              lastMessageAck: latest.ack || 0
            } as any,
            { where: { id: ticket.id }, silent: true } as any
          );
        }
      },
      onProgress
    );
    await connection.update({ historyImportedAt: new Date() });
    return report;
  } catch (err) {
    logger.error({ info: "History import failed", err: String(err) });
    throw err;
  } finally {
    running.delete(connection.id);
  }
};

// Runs the copy in the background and tells the screens how far it is (socket "historyImport").
export const startHistoryImport = (
  connection: Whatsapp,
  userId: number | null,
  options: { perChat?: number; includeGroups?: boolean } = {}
): void => {
  const io = getIO();
  const base = { userId, whatsappId: connection.id, connection: connection.name };
  importHistory(connection, options, (done, total) => io.emit("historyImport", { ...base, finished: false, done, total }))
    .then(report => io.emit("historyImport", { ...base, finished: true, ok: true, ...report }))
    .catch(err => io.emit("historyImport", { ...base, finished: true, ok: false, message: err?.message || "ERR_IMPORT" }));
};
