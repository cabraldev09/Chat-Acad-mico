import { ChannelAdapter } from "./types";
import telegram from "./telegram";
import webchat from "./webchat";
import { messenger, instagram, whatsappCloud } from "./meta";

const adapters: Record<string, ChannelAdapter> = {
  telegram,
  webchat,
  messenger,
  instagram,
  whatsapp_cloud: whatsappCloud
};

export const CHANNEL_TYPES = ["whatsapp", ...Object.keys(adapters)];

export const getAdapter = (channel: string): ChannelAdapter => {
  const adapter = adapters[channel];
  if (!adapter) throw new Error(`ERR_UNKNOWN_CHANNEL_${channel}`);
  return adapter;
};
