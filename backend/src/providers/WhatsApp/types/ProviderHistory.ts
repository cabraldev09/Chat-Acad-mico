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
}
