import Whatsapp from "../../models/Whatsapp";
import { getIO } from "../../libs/socket";

export const setChannelStatus = async (
  whatsapp: Whatsapp,
  status: string
): Promise<void> => {
  await whatsapp.update({ status, qrcode: "" });
  getIO().emit("whatsappSession", { action: "update", session: whatsapp });
};
