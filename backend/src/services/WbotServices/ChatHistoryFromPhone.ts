import Contact from "../../models/Contact";
import Message from "../../models/Message";
import Ticket from "../../models/Ticket";
import Whatsapp from "../../models/Whatsapp";
import { logger } from "../../utils/logger";
import { copyEnabled, importHistory, isHistoryRunning } from "./ImportHistoryService";

// One conversation of a QR Code number, copied from the phone on demand (silently, as history; nothing rings):
//  - "first": a contact opened by hand (the "+" of Conversas) brings its latest messages, so the conversation does not start empty;
//  - "older": scrolling to the top of a conversation brings the 100 messages before the oldest one held, until the start of the chat.
// It never waits more than a few seconds: when the phone is slow, the screen shows what it has and the next try brings the rest.
const STEP = 100;
const MAX = Number(process.env.WHATSAPP_HISTORY_MAX_PER_CHAT || 3000);
const busy = new Set<number>();
// the load of the phone: one conversation at a time per number, and at most PER_MINUTE readings a minute per number (the scroll of many
// people at once does not pile up on the browser of the number)
const PER_MINUTE = Number(process.env.WHATSAPP_ON_DEMAND_PER_MINUTE || 6);
const busyConnection = new Set<number>();
const recentByConnection = new Map<number, number[]>();
const takeSlot = (whatsappId: number): boolean => {
  if (busyConnection.has(whatsappId)) return false;
  const now = Date.now();
  const recent = (recentByConnection.get(whatsappId) || []).filter(t => now - t < 60000);
  if (recent.length >= PER_MINUTE) { recentByConnection.set(whatsappId, recent); return false; }
  recent.push(now);
  recentByConnection.set(whatsappId, recent);
  busyConnection.add(whatsappId);
  return true;
};
// conversations whose start was reached on the phone (asking again would bring nothing)
const reachedStart = new Set<number>();

// a conversation of a connected QR Code number may have older messages on the phone than the ones held here
export const mayHaveOlder = async (ticketId: number): Promise<boolean> => {
  if (reachedStart.has(ticketId)) return false;
  const ticket = await Ticket.findByPk(ticketId, { attributes: ["id", "whatsappId"] });
  if (!ticket || !ticket.whatsappId) return false;
  if (!(await copyEnabled())) return false;
  const connection = await Whatsapp.findByPk(ticket.whatsappId, { attributes: ["id", "channel", "status"] });
  if (!connection || connection.channel !== "whatsapp" || connection.status !== "CONNECTED") return false;
  return (await Message.count({ where: { ticketId } })) < MAX;
};

export const chatIdOfContact = (contact: { number?: string | null; isGroup?: boolean }): string | null => {
  const n = String(contact.number || "").trim();
  if (!n) return null;
  return contact.isGroup ? (n.includes("@") ? n : `${n}@g.us`) : `${n.replace(/\D/g, "")}@c.us`;
};

export const copyChatFromPhone = async (ticketId: number, mode: "first" | "older", waitMs = 12000): Promise<number> => {
  if (busy.has(ticketId) || !(await copyEnabled())) return 0;
  const ticket = await Ticket.findByPk(ticketId, { attributes: ["id", "whatsappId", "contactId"] });
  if (!ticket || !ticket.whatsappId) return 0;
  const connection = await Whatsapp.findByPk(ticket.whatsappId);
  // only WhatsApp by QR Code keeps the phone's history; the official API has no history to read
  if (!connection || connection.channel !== "whatsapp" || connection.status !== "CONNECTED" || isHistoryRunning(connection.id)) return 0;
  const contact = await Contact.findByPk(ticket.contactId, { attributes: ["id", "number", "isGroup"] });
  const chatId = contact ? chatIdOfContact(contact) : null;
  if (!chatId) return 0;
  const held = await Message.count({ where: { ticketId } });
  const perChat = Math.min(MAX, mode === "first" ? STEP : held + STEP);
  if (mode === "older" && held >= MAX) return 0;
  if (!takeSlot(connection.id)) return 0;
  busy.add(ticketId);
  try {
    const run = importHistory(connection, { onlyChatIds: [chatId], perChat, includeGroups: true });
    const report = await Promise.race([run, new Promise<null>(resolve => setTimeout(() => resolve(null), waitMs))]);
    if (!report) return 0;
    const added = (await Message.count({ where: { ticketId } })) - held;
    if (mode === "older" && added <= 0) reachedStart.add(ticketId);
    return added;
  } catch (err) {
    logger.warn(`Histórico da conversa ${ticketId} não veio do celular: ${(err as Error).message}`);
    return 0;
  } finally {
    busy.delete(ticketId);
    busyConnection.delete(connection.id);
  }
};
