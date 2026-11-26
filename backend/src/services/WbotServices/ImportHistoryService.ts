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
  // what the phone had, so the screen can say whether everything came: every chat of the phone (status and channels included), the ones
  // the copy looks at, the chats of people with no message (left out on purpose) and the ones that failed
  phoneTotal?: number;
  considered?: number;
  empty?: number;
  failed?: number;
  finishedAt?: string;
}

// "Trazidas 312 de 312 conversas do celular" / "300 de 312: 10 sem mensagem, 2 com erro"
export const reportText = (r: HistoryReport): string => {
  if (r.considered === undefined) return `${r.chats} conversas copiadas`;
  const parts = [r.empty ? `${r.empty} sem mensagem` : "", r.failed ? `${r.failed} com erro` : ""].filter(Boolean);
  const all = r.chats >= r.considered;
  return all
    ? `Trazidas ${r.chats} de ${r.considered} conversas do celular`
    : `Trazidas ${r.chats} de ${r.considered} conversas do celular: ${parts.join(", ") || "as outras não vieram"}`;
};

const running = new Set<number>();
const MEDIA_KIND: Record<string, string> = {
  image: "image",
  sticker: "image",
  video: "video",
  audio: "audio",
  ptt: "audio",
  document: "document"
};

export const isHistoryRunning = (whatsappId: number): boolean => running.has(whatsappId);

// THE SWITCH OF THE COPY (Conexões, administration): off, no copy runs (automatic on connecting, the button, the older messages on scroll,
// the conversation of a contact opened by hand). On by default.
export const copyEnabled = async (): Promise<boolean> => {
  const { getSetting } = await import("../../helpers/AppSettings");
  return (await getSetting("whatsapp_copy_enabled", "true")) !== "false";
};

// On a person's own number (QR Code), the chats with activity in the last days come into "Atendendo" with that person, as on the phone;
// older ones stay as history (in "Todas" and in the search). Everything copied stays HISTORY for the numbers of the system (dashboards,
// CRM, response times), whatever list it shows in.
export const RECENT_DAYS = Number(process.env.WHATSAPP_IMPORT_RECENT_DAYS || 30);
export const placeOf = (
  chat: { archived?: boolean; isGroup?: boolean },
  ownerId: number | null | undefined,
  lastAt: Date,
  now: Date = new Date()
): { status: "open" | "closed"; userId: number | null } => {
  const recent = now.getTime() - lastAt.getTime() <= RECENT_DAYS * 86400000;
  if (ownerId && recent && !chat.archived) return { status: "open", userId: ownerId };
  return { status: "closed", userId: ownerId || null };
};

// Copies the conversations that already exist on the phone into the system as HISTORY: readable and
// searchable, but never counted in the dashboards or the CRM, and silent (no automations, no alerts).
// When the person writes again, the conversation comes back to life by itself.
export const importHistory = async (
  connection: Whatsapp,
  options: { perChat?: number; includeGroups?: boolean; waitForSync?: boolean; onlyChatIds?: string[] } = {},
  onProgress?: (done: number, total: number) => void
): Promise<HistoryReport> => {
  if (!whatsappProvider.importChats) throw new AppError("ERR_WAPP_NOT_INITIALIZED");
  if (!(await copyEnabled())) throw new AppError("ERR_HISTORY_COPY_OFF", 409);
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
    const summary = await whatsappProvider.importChats(
      connection.id,
      {
        // one chat asked by name may go further back (scrolling to its start); the copy of the whole number stays light
        perChat: Math.min(Math.max(Number(options.perChat) || 100, 10), options.onlyChatIds ? 3000 : 300),
        includeGroups: options.includeGroups !== false,
        waitForSync: !!options.waitForSync,
        onlyChatIds: options.onlyChatIds
      },
      async chat => {
        const contact = await CreateOrUpdateContactService({
          name: chat.contact.name,
          number: chat.contact.number,
          lid: chat.contact.lid,
          isGroup: chat.isGroup,
          community: chat.community,
          // copied history: no "Novo contato" trigger, no socket event per contact
          silent: true
        });

        // a group can come with no message copied (it is part of the number all the same): its time is the chat's
        const times = chat.messages.map(m => m.timestamp * 1000).sort((a, b) => a - b);
        const chatTime = chat.timestamp ? chat.timestamp * 1000 : Date.now();
        const first = new Date(times.length ? times[0] : chatTime);
        const last = new Date(times.length ? Math.max(times[times.length - 1], chatTime) : chatTime);
        const latest = [...chat.messages].sort((a, b) => b.timestamp - a.timestamp)[0] || null;
        const place = placeOf(chat, connection.ownerId, last);

        let ticket = await Ticket.findOne({
          where: { contactId: contact.id, whatsappId: connection.id },
          order: [["updatedAt", "DESC"]]
        });
        let isNew = false;
        if (!ticket) {
          ticket = await Ticket.create({
            contactId: contact.id,
            whatsappId: connection.id,
            status: place.status,
            isGroup: chat.isGroup,
            // the phone's unread count, shown as it is (copied history never rings)
            unreadMessages: place.status === "open" ? chat.unreadCount || 0 : 0,
            isHistorical: true,
            userId: place.userId,
            lastMessage: latest ? latest.body.slice(0, 1000) : null,
            lastMessageId: latest ? latest.id : null,
            lastMessageFromMe: latest ? !!latest.fromMe : false,
            lastMessageAck: latest ? latest.ack || 0 : 0,
            lastMessageType: "chat",
            lastMessageAt: last,
            lastMessageAuthor: latest && chat.isGroup && !latest.fromMe && latest.author ? latest.author.name : null,
            waChatTimestamp: last,
            closedAt: place.status === "closed" ? last : null,
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
              isGroup: false,
              silent: true
            }).catch(() => null);
            if (person) people.set(key, person.id);
          }
        }

        if (chat.messages.length) await Message.bulkCreate(
          chat.messages.map(m => ({
            id: m.id,
            ticketId: ticket.id,
            body: m.body,
            fromMe: m.fromMe,
            read: true,
            // the kind stays known so the file can be loaded later with one click
            mediaType: MEDIA_KIND[m.type || ""] || "chat",
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
        if (!isNew && ticket.isHistorical && latest) {
          await Ticket.update(
            {
              lastMessage: latest.body.slice(0, 1000),
              lastMessageId: latest.id,
              lastMessageFromMe: !!latest.fromMe,
              lastMessageAck: latest.ack || 0,
              lastMessageType: "chat",
              lastMessageAt: last,
              lastMessageAuthor: chat.isGroup && !latest.fromMe && latest.author ? latest.author.name : null,
              // a copy run again places it as the phone has it now (recent: in Atendendo with its owner)
              ...(ticket.status !== "open" && place.status === "open" ? { status: "open", userId: place.userId, closedAt: null } : {})
            } as any,
            { where: { id: ticket.id }, silent: true } as any
          );
        }
      },
      onProgress
    );
    if (summary) Object.assign(report, { phoneTotal: summary.phoneTotal, considered: summary.considered, empty: summary.empty, failed: summary.failed });
    report.finishedAt = new Date().toISOString();
    // a copy of some chats only (a contact opened by hand) does not mark the number as copied, nor replaces the report of the whole copy
    if (!options.onlyChatIds) await connection.update({ historyImportedAt: new Date(), historyReport: JSON.stringify(report) } as any);
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
  options: { perChat?: number; includeGroups?: boolean; waitForSync?: boolean } = {}
): Promise<HistoryReport | null> => {
  const io = getIO();
  const base = { userId, whatsappId: connection.id, connection: connection.name };
  io.emit("historyImport", { ...base, finished: false, done: 0, total: 0 });
  return importHistory(connection, options, (done, total) => io.emit("historyImport", { ...base, finished: false, done, total }))
    .then(report => {
      io.emit("historyImport", { ...base, finished: true, ok: true, ...report, text: reportText(report) });
      // the conversations copied are read next (who is a lead, who enrolled, who stopped and why), silently
      if (report.chats > 0) import("../../workers/ConversationReading").then(m => m.readAfterCopy(connection.id)).catch(() => undefined);
      return report;
    })
    .catch(err => {
      io.emit("historyImport", { ...base, finished: true, ok: false, message: err?.message || "ERR_IMPORT" });
      return null;
    });
};

// The copy that starts by itself when a number connects: it waits for WhatsApp Web to finish receiving the chats and tries again (up to 3
// times, waiting longer each time) when it fails or finds nothing. A number already copied is never copied again here.
export const autoImportHistory = async (connection: Whatsapp, waits: number[] = [60000, 180000, 600000]): Promise<HistoryReport | null> => {
  for (let attempt = 0; attempt <= waits.length; attempt += 1) {
    // eslint-disable-next-line no-await-in-loop
    if (!(await copyEnabled())) return null;
    // eslint-disable-next-line no-await-in-loop
    const fresh = await Whatsapp.findByPk(connection.id);
    if (!fresh || fresh.historyImportedAt || fresh.status !== "CONNECTED") return null;
    if (running.has(fresh.id)) return null;
    // eslint-disable-next-line no-await-in-loop
    const report = await startHistoryImport(fresh, fresh.ownerId || null, { waitForSync: true });
    if (report && report.chats > 0) return report;
    // nothing came (the phone had not sent the chats yet) or it failed: the number is not marked as copied, so it is tried again
    if (report && report.chats === 0) await fresh.update({ historyImportedAt: null } as any);
    if (attempt < waits.length) {
      logger.warn(`History: copy of ${fresh.name} ${report ? "found no chat" : "failed"}; trying again in ${Math.round(waits[attempt] / 1000)}s`);
      // eslint-disable-next-line no-await-in-loop
      await new Promise(resolve => setTimeout(resolve, waits[attempt]));
    }
  }
  return null;
};
