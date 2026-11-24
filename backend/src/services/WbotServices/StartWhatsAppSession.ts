import Whatsapp from "../../models/Whatsapp";
import { whatsappProvider } from "../../providers/WhatsApp";
import { getIO } from "../../libs/socket";
import { logger } from "../../utils/logger";
import { getAdapter } from "../../channels";
import { withoutActor } from "../../helpers/Actor";

// started from a request (the admin connects a number): its listeners must not record that person as the actor of every answer
export const StartWhatsAppSession = (whatsapp: Whatsapp): Promise<void> => withoutActor(() => startSession(whatsapp));

const startSession = async (
  whatsapp: Whatsapp
): Promise<void> => {
  // Automated E2E runs must not start a real WWebJS/Chromium session when
  // creating or updating a QR-code connection. API channel adapters still run.
  if (process.env.SKIP_WHATSAPP_SESSIONS && whatsapp.channel === "whatsapp") return;

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
