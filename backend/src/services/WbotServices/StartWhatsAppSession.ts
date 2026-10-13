import Whatsapp from "../../models/Whatsapp";
import { whatsappProvider } from "../../providers/WhatsApp";
import { getIO } from "../../libs/socket";
import { logger } from "../../utils/logger";
import { getAdapter } from "../../channels";

export const StartWhatsAppSession = async (
  whatsapp: Whatsapp
): Promise<void> => {
  await whatsapp.update({ status: "OPENING" });

  const io = getIO();
  io.emit("whatsappSession", {
    action: "update",
    session: whatsapp
  });

  try {
    if (whatsapp.channel && whatsapp.channel !== "whatsapp") {
      await getAdapter(whatsapp.channel).start(whatsapp);
    } else {
      await whatsappProvider.init(whatsapp);
    }
  } catch (err) {
    logger.error(err);
  }
};
