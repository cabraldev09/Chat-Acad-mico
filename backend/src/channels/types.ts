import Whatsapp from "../models/Whatsapp";
import Contact from "../models/Contact";

export type ChannelType =
  | "whatsapp"
  | "telegram"
  | "webchat"
  | "messenger"
  | "instagram"
  | "whatsapp_cloud";

export interface OutboundMedia {
  path: string;
  filename: string;
  mimetype: string;
}

export interface ChannelAdapter {
  type: ChannelType;
  // Prefix used to build Contact.number from the channel's external id
  prefix: string;
  start(whatsapp: Whatsapp): Promise<void>;
  stop(whatsapp: Whatsapp): Promise<void>;
  sendText(
    whatsapp: Whatsapp,
    contact: Contact,
    body: string
  ): Promise<{ id: string }>;
  // A question with options the person taps (buttons, list, quick replies). The tap comes back as an ordinary message
  // whose text is the option; channels without this fall back to a numbered text menu.
  sendChoices?(
    whatsapp: Whatsapp,
    contact: Contact,
    question: string,
    options: Array<{ id: string; label: string }>
  ): Promise<{ id: string }>;
  sendMedia(
    whatsapp: Whatsapp,
    contact: Contact,
    media: OutboundMedia,
    caption?: string
  ): Promise<{ id: string }>;
  // Approved message templates (WhatsApp Cloud API: required to start a
  // conversation outside the 24h customer service window)
  sendReaction?(
    whatsapp: Whatsapp,
    contact: Contact,
    messageId: string,
    emoji: string
  ): Promise<void>;
  // shows "digitando…" to the contact while the agent writes (channels that support it)
  sendTyping?(whatsapp: Whatsapp, contact: Contact): Promise<void>;
  sendTemplate?(
    whatsapp: Whatsapp,
    contact: Contact,
    template: { name: string; language: string; params: string[] }
  ): Promise<{ id: string }>;
}

export const getConfig = (whatsapp: Whatsapp): Record<string, any> => {
  try {
    return whatsapp.config ? JSON.parse(whatsapp.config) : {};
  } catch (e) {
    return {};
  }
};

export const externalIdOf = (contact: Contact, prefix: string): string =>
  prefix && contact.number.startsWith(prefix)
    ? contact.number.slice(prefix.length)
    : contact.number;

export const mediaKindOf = (mimetype: string): "image" | "video" | "audio" | "file" => {
  if (mimetype.startsWith("image/")) return "image";
  if (mimetype.startsWith("video/")) return "video";
  if (mimetype.startsWith("audio/")) return "audio";
  return "file";
};
