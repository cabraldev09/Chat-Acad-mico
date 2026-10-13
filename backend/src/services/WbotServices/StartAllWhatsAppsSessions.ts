import ListWhatsAppsService from "../WhatsappService/ListWhatsAppsService";
import { StartWhatsAppSession } from "./StartWhatsAppSession";

export const StartAllWhatsAppsSessions = async (): Promise<void> => {
  const whatsapps = await ListWhatsAppsService();
  if (whatsapps.length > 0) {
    whatsapps.forEach(whatsapp => {
      // lets automated tests run API channels without touching a QR session
      if (process.env.SKIP_WHATSAPP_SESSIONS && whatsapp.channel === "whatsapp") {
        return;
      }
      StartWhatsAppSession(whatsapp);
    });
  }
};
