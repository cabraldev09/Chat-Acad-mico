// One existing conversation of the phone, with its latest messages, used to copy history into the system.
export interface ProviderHistoryMessage {
  id: string;
  body: string;
  fromMe: boolean;
  // seconds since 1970, as WhatsApp gives it
  timestamp: number;
  ack: number;
  // kind of message (image, video, ptt, document...): lets the file be loaded later on demand
  type?: string;
  // in groups: who wrote it
  author?: { name: string; number: string; lid?: string };
}

export interface ProviderHistoryChat {
  isGroup: boolean;
  // the chat id on WhatsApp ("5569...@c.us", "...@g.us")
  chatId?: string;
  // seconds since 1970 of the last activity of the chat, as the phone shows it (also for a group with no message copied)
  timestamp?: number;
  // the unread count the phone shows
  unreadCount?: number;
  // a WhatsApp Community, its announcement group or one of its groups
  community?: { kind: "community" | "group"; role?: "parent" | "announcement" | "member"; communityId?: string | null; parentGroupId?: string | null; readOnly?: boolean };
  // as it is on the phone: pinned at the top, archived
  pinned: boolean;
  archived: boolean;
  name: string;
  contact: {
    name: string;
    number: string;
    lid?: string;
    isGroup: boolean;
  };
  messages: ProviderHistoryMessage[];
}

export interface HistoryOptions {
  perChat: number;
  includeGroups: boolean;
  // right after a QR Code is read WhatsApp Web is still receiving the chats from the phone: wait until their count stops growing
  waitForSync?: boolean;
  // only these chats (a contact opened by hand, a chat found later): the rest is left as it is
  onlyChatIds?: string[];
}
