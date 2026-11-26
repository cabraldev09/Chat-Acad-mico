import Whatsapp from "../../models/Whatsapp";
import {
  ProviderMessage,
  ProviderMediaInput,
  ProviderContact,
  SendMessageOptions,
  SendMediaOptions,
  ProviderHistoryChat,
  HistoryOptions
} from "./types";
import { WhatsappWebJsProvider } from "./Implementations/wwebjs";
import { ZapoProvider } from "./Implementations/zapo";

// what a copy of the phone found: every chat of the phone, the ones considered (no status, no channels), and why some did not come
export interface ImportSummary { phoneTotal: number; considered: number; empty: number; failed: number }

export interface WhatsappProvider {
  init(whatsapp: Whatsapp): Promise<void>;
  removeSession(whatsappId: number): void;
  logout(sessionId: number): Promise<void>;
  sendMessage(
    sessionId: number,
    to: string,
    body: string,
    options?: SendMessageOptions
  ): Promise<ProviderMessage>;
  sendMedia(
    sessionId: number,
    to: string,
    media: ProviderMediaInput,
    options?: SendMediaOptions
  ): Promise<ProviderMessage>;
  deleteMessage(
    sessionId: number,
    chatId: string,
    messageId: string,
    fromMe: boolean
  ): Promise<void>;
  // changes the text of a message already sent (WhatsApp allows it for about 15 minutes)
  editMessage?(
    sessionId: number,
    chatId: string,
    messageId: string,
    fromMe: boolean,
    body: string
  ): Promise<void>;
  checkNumber(sessionId: number, number: string): Promise<string>;
  getProfilePicUrl(sessionId: number, number: string): Promise<string>;
  // the picture of any chat (person or group), addressed by its full WhatsApp id
  getChatPicUrl?(sessionId: number, chatId: string): Promise<string | undefined>;
  getContacts(sessionId: number): Promise<ProviderContact[]>;
  // every person the number knows, saved or not, with the names WhatsApp has for them (QR Code only)
  getPhoneNames?(sessionId: number): Promise<import("../../helpers/PhoneNames").PhoneName[]>;
  // the "recado" of the profile (about), when the person shows it
  getAbout?(sessionId: number, chatId: string): Promise<string | undefined>;
  getChatUnreadCount?(sessionId: number, chatId: string): Promise<number | null>;
  sendSeen(sessionId: number, chatId: string): Promise<void>;
  // shows "typing…" to the contact (optional, used to humanize bot replies)
  sendTyping?(sessionId: number, chatId: string): Promise<void>;
  // shows "gravando áudio…" to the contact while the agent records
  sendRecording?(sessionId: number, chatId: string): Promise<void>;
  // groups this connection belongs to (used to pick which ones become conversations)
  listGroups?(sessionId: number): Promise<{ id: string; name: string; participants: number }[]>;
  // walks over the existing conversations of the phone (most recent first), calling `onChat` for each one
  importChats?(
    sessionId: number,
    options: HistoryOptions,
    onChat: (chat: ProviderHistoryChat) => Promise<void>,
    onProgress?: (done: number, total: number) => void
  ): Promise<void | ImportSummary>;
  // reacts to a message with an emoji ("" removes the reaction)
  sendReaction?(
    sessionId: number,
    chatId: string,
    messageId: string,
    fromMe: boolean,
    emoji: string
  ): Promise<void>;
  // current delivery state of a message as the phone knows it (null: not found)
  getMessageAck?(sessionId: number, chatId: string, messageId: string, fromMe: boolean): Promise<number | null>;
  // downloads the file of a message again (media that did not arrive, or history copied without files)
  downloadMessageMedia?(
    sessionId: number,
    chatId: string,
    messageId: string,
    fromMe: boolean
  ): Promise<{ filename: string; mimetype: string; data: string; isGif?: boolean } | null>;
  // a poll (title, options)
  sendPoll?(sessionId: number, chatId: string, title: string, options: string[], multiple: boolean): Promise<ProviderMessage>;
  // group description and members, as the phone shows them
  getGroupInfo?(
    sessionId: number,
    chatId: string
  ): Promise<{ name: string; description: string; createdAt?: number; participants: { id: string; key?: string; isLid?: boolean; phone?: string; name?: string; isAdmin: boolean; isSuperAdmin?: boolean }[] } | null>;
  // who received, read and listened to a message sent from this number (QR Code only)
  getMessageInfo?(
    sessionId: number,
    chatId: string,
    messageId: string
  ): Promise<{ delivery: PersonSeen[]; read: PersonSeen[]; played: PersonSeen[]; deliveryRemaining: number; readRemaining: number; playedRemaining: number } | null>;
  // forwards a message of the phone to another chat of the same number, as the phone does (QR Code only); null = not on the phone
  forwardMessage?(sessionId: number, fromChatId: string, messageId: string, fromMe: boolean, toChatId: string): Promise<{ id: string | null } | null>;
  fetchChatMessages(
    sessionId: number,
    chatId: string,
    limit: number
  ): Promise<ProviderMessage[]>;
}

export interface PersonSeen { id: string; key: string; isLid: boolean; phone: string; name: string; t: number }

const provider = process.env.WHATSAPP_PROVIDER || "wwebjs";

const providersMap: Record<string, WhatsappProvider> = {
  wwebjs: WhatsappWebJsProvider,
  zapo: ZapoProvider,
  whaileys: ZapoProvider
};

const whatsappProvider = providersMap[provider];

export { whatsappProvider };
