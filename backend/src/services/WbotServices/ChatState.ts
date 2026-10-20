import { Op } from "sequelize";
import { getIO } from "../../libs/socket";
import Contact from "../../models/Contact";
import Ticket from "../../models/Ticket";
import { remember } from "../../helpers/TtlCache";
import { logger } from "../../utils/logger";

// "digitando…" like WhatsApp: who is typing in a conversation, told to everyone who has it open or in the list.
//   from "contact": the lead (read from the WhatsApp Web of the connection, see watchChatState); from "agent": the AI agent while it types.
//   kind: "typing" | "recording" | "idle" (stopped). `ms` is how long the screen may show it without a new event.
export type TypingKind = "typing" | "recording" | "idle";

export const emitTyping = (ticketId: number, from: "contact" | "agent", kind: TypingKind = "typing", ms = 6000): void => {
  try {
    // the open chat (room of the ticket) and the lists (their status rooms and the notification room); the gate lets each person hear only what they may read
    getIO().to(String(ticketId)).to("notification").to("open").to("pending").emit("typing", { ticketId, from, kind, ms });
  } catch (err) {
    logger.debug(`typing event not sent: ${err}`);
  }
};

// the open conversation of a chat id ("5569…@c.us" or "…@lid") of a connection; never creates anything
const ticketOfChat = (whatsappId: number, chatId: string): Promise<number | null> =>
  remember(`chatstate:${whatsappId}:${chatId}`, 20000, async () => {
    const user = chatId.split("@")[0];
    const contact = await Contact.findOne({ where: { isGroup: false, [Op.or]: [{ number: user }, { lid: chatId }, { lid: user }] } as any, attributes: ["id"] });
    if (!contact) return null;
    const ticket = await Ticket.findOne({ where: { contactId: contact.id, whatsappId, isGroup: false, status: { [Op.in]: ["open", "pending"] } } as any, attributes: ["id"], order: [["id", "DESC"]] });
    return ticket ? ticket.id : null;
  });

const KIND: Record<string, TypingKind> = { typing: "typing", composing: "typing", recording: "recording", recording_audio: "recording", idle: "idle", paused: "idle" };

const reported = new Set<number>();

// The library has no event for "the contact is typing", but the WhatsApp Web inside the connection knows it. This listens to its presence
// records (several module names are tried because they change between versions). If none exists, it says so once in the log and the
// conversation simply shows no "digitando…" from the lead: nothing else depends on it.
export const watchChatState = async (wbot: any, whatsappId: number): Promise<void> => {
  const page = wbot?.pupPage;
  if (!page) return;
  try {
    try {
      await page.exposeFunction("onChatStateChange", (chatId: string, state: string) => {
        if (!chatId || chatId.endsWith("@g.us") || chatId.endsWith("@broadcast")) return;
        const kind = KIND[String(state || "idle")] || "idle";
        ticketOfChat(whatsappId, chatId)
          .then(ticketId => { if (ticketId) emitTyping(ticketId, "contact", kind, kind === "idle" ? 0 : 30000); })
          .catch(() => undefined);
      });
    } catch (err) {
      /* already exposed on this page (the session came back without reloading the page) */
    }
    const how: string = await page.evaluate(() => {
      const w: any = window;
      const load = (name: string): any => { try { return w.require(name); } catch (e) { return null; } };
      let coll: any = null;
      let via = "";
      for (const name of ["WAWebPresenceCollection", "WAWebChatStateCollection"]) {
        const mod = load(name);
        const c = mod && (mod.PresenceCollection || mod.ChatStateCollection || mod.default);
        if (c && typeof c.on === "function") { coll = c; via = name; break; }
      }
      if (!coll) return "unsupported";
      if (coll.__chatStateWatched) return `already:${via}`;
      coll.__chatStateWatched = true;
      const tell = (presence: any, type: any): void => {
        try {
          const id = presence && presence.id && (presence.id._serialized || String(presence.id));
          if (id) w.onChatStateChange(id, type || "idle");
        } catch (e) { /* the page is closing */ }
      };
      const attach = (presence: any): void => {
        const cs = presence && presence.chatstate;
        if (cs && typeof cs.on === "function" && !cs.__watched) {
          cs.__watched = true;
          cs.on("change:type", () => tell(presence, cs.type));
        }
      };
      coll.on("add", attach);
      coll.on("change:chatstate", (presence: any) => { attach(presence); tell(presence, presence.chatstate && presence.chatstate.type); });
      (coll.models || []).forEach(attach);
      return `ok:${via}`;
    });
    if (!reported.has(whatsappId)) {
      reported.add(whatsappId);
      if (how === "unsupported") logger.warn(`Conexão ${whatsappId}: este WhatsApp Web não informa quando o contato está digitando; a conversa não mostrará o "digitando…" do lead`);
      else logger.info(`Conexão ${whatsappId}: "digitando…" do lead ligado (${how})`);
    }
  } catch (err) {
    logger.debug(`typing watcher not started: ${err}`);
  }
};
