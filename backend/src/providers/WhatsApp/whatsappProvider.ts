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
  checkNumber(sessionId: number, number: string): Promise<string>;
  getProfilePicUrl(sessionId: number, number: string): Promise<string>;
  // the picture of any chat (person or group), addressed by its full WhatsApp id
  getChatPicUrl?(sessionId: number, chatId: string): Promise<string | undefined>;
  getContacts(sessionId: number): Promise<ProviderContact[]>;
  sendSeen(sessionId: number, chatId: string): Promise<void>;
  // shows "typing…" to the contact (optional, used to humanize bot replies)
  sendTyping?(sessionId: number, chatId: string): Promise<void>;
  // groups this connection belongs to (used to pick which ones become conversations)
  listGroups?(sessionId: number): Promise<{ id: string; name: string; participants: number }[]>;
  // walks over the existing conversations of the phone (most recent first), calling `onChat` for each one
  importChats?(
    sessionId: number,
    options: HistoryOptions,
    onChat: (chat: ProviderHistoryChat) => Promise<void>,
    onProgress?: (done: number, total: number) => void
  ): Promise<void>;
  // reacts to a message with an emoji ("" removes the reaction)
  sendReaction?(
    sessionId: number,
    chatId: string,
    messageId: string,
    fromMe: boolean,
    emoji: string
  ): Promise<void>;
  fetchChatMessages(
    sessionId: number,
    chatId: string,
    limit: number
  ): Promise<ProviderMessage[]>;
}

const provider = process.env.WHATSAPP_PROVIDER || "wwebjs";

const providersMap: Record<string, WhatsappProvider> = {
  wwebjs: WhatsappWebJsProvider,
  zapo: ZapoProvider,
  whaileys: ZapoProvider
};

const whatsappProvider = providersMap[provider];

export { whatsappProvider };
