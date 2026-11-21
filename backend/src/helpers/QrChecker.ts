import Whatsapp from "../models/Whatsapp";

// The connection that can ask WhatsApp things only a phone session knows (does this number exist? its picture?): a WhatsApp by QR
// Code that is connected, the default one first. With only the official API (no QR), there is none and the callers fall back to
// the number as typed (the Cloud API has no such lookup).
export const qrChecker = async (): Promise<Whatsapp | null> => {
  const def = await Whatsapp.findOne({ where: { isDefault: true, channel: "whatsapp", status: "CONNECTED" } as any });
  if (def) return def;
  return Whatsapp.findOne({ where: { channel: "whatsapp", status: "CONNECTED" } as any, order: [["id", "ASC"]] });
};
