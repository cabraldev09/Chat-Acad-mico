import Whatsapp from "../models/Whatsapp";
import { getConfig } from "./types";

// Meta calls one webhook URL per app: with several official numbers in the same app (one per polo), the events of every number arrive at
// the URL of whichever connection was registered. Each event goes to the connection of its own number, but only to one of the same app
// (same App Secret, the one that signed the request): a request signed by one app never writes into the number of another.
export const cloudConnectionFor = async (whatsapp: Whatsapp, phoneNumberId: string): Promise<Whatsapp | null> => {
  const config = getConfig(whatsapp);
  if (!phoneNumberId) return null;
  if (phoneNumberId === config.phoneNumberId) return whatsapp;
  const others = await Whatsapp.findAll({ where: { channel: "whatsapp_cloud" } as any });
  return others.find(w => w.id !== whatsapp.id && getConfig(w).phoneNumberId === phoneNumberId && !!config.appSecret && getConfig(w).appSecret === config.appSecret) || null;
};
