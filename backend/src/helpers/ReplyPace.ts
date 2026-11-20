import axios from "axios";
import { Op } from "sequelize";

import Message from "../models/Message";
import Ticket from "../models/Ticket";
import Whatsapp from "../models/Whatsapp";
import { getConfig } from "../channels/types";
import { emitTyping } from "../services/WbotServices/ChatState";
import { logger } from "../utils/logger";

// How fast the AI answers, like a good consultant on the official number: the first message of a conversation is answered at once (a
// lead that just wrote is the hottest lead there is); after that the AI waits for the person to finish the burst (the agent's
// "espera antes de responder") and shows "digitando…" for a moment proportional to the text before each bubble, so it reads as a
// person typing. Everything together stays under about 8 seconds, so the lead does not cool down.
export const MAX_TYPING_MS = 4000;
export const MIN_TYPING_MS = 1000;
export const FIRST_REPLY_SECONDS = 1;

// "a new conversation": nothing sent to the person in the last 6 hours (a lead who comes back the next day is answered at once too)
const FRESH_MS = 6 * 3600 * 1000;
const hasOutbound = async (ticketId: number): Promise<boolean> =>
  (await Message.count({ where: { ticketId, fromMe: true, createdAt: { [Op.gte]: new Date(Date.now() - FRESH_MS) } } as any })) > 0;

// seconds to wait before the AI starts answering this message
export const startDelayOf = async (ticket: Pick<Ticket, "id">, waitSeconds: number | null | undefined): Promise<number> => {
  // one second only: messages sent together ("oi" + "quero saber de Pedagogia") still get one answer
  if (!(await hasOutbound(ticket.id))) return FIRST_REPLY_SECONDS;
  return Math.min(15, Math.max(0, Number(waitSeconds ?? 4)));
};

export const typingMsFor = (text: string): number => Math.min(MAX_TYPING_MS, Math.max(MIN_TYPING_MS, 600 + String(text || "").length * 25));

// the official API shows "digitando…" to the person when the last message they sent is marked as read with the typing indicator
const cloudTyping = async (ticket: Ticket): Promise<void> => {
  const whatsapp = ticket.whatsapp || (ticket.whatsappId ? await Whatsapp.findByPk(ticket.whatsappId) : null);
  if (!whatsapp || whatsapp.channel !== "whatsapp_cloud") return;
  const last = await Message.findOne({ where: { ticketId: ticket.id, fromMe: false }, order: [["createdAt", "DESC"]], attributes: ["id"] });
  if (!last || !/^wamid\./.test(String(last.id))) return;
  const { accessToken, phoneNumberId } = getConfig(whatsapp);
  if (!accessToken || !phoneNumberId) return;
  const { GRAPH } = await import("../channels/meta");
  await axios.post(`${GRAPH}/${phoneNumberId}/messages`, { messaging_product: "whatsapp", status: "read", message_id: last.id, typing_indicator: { type: "text" } },
    { headers: { Authorization: `Bearer ${accessToken}` }, timeout: 8000 });
};

// before each bubble of the AI: nothing on the very first one, "digitando…" and a short pause on the others
export const paceBeforeSend = async (ticket: Ticket, text: string): Promise<void> => {
  if (process.env.NODE_ENV === "test" && process.env.REPLY_PACE !== "1") return;
  if (!(await hasOutbound(ticket.id))) return;
  const ms = typingMsFor(text);
  emitTyping(ticket.id, "agent", "typing", ms + 500);
  await cloudTyping(ticket).catch(err => logger.debug(`typing indicator not sent: ${err?.message || err}`));
  await new Promise(r => setTimeout(r, ms));
};
