import { Request, Response } from "express";
import { whatsappProvider } from "../providers/WhatsApp";
import { getAdapter } from "../channels";
import { getIO } from "../libs/socket";
import ShowWhatsAppService from "../services/WhatsappService/ShowWhatsAppService";
import { StartWhatsAppSession } from "../services/WbotServices/StartWhatsAppSession";
import AppError from "../errors/AppError";
import { normalizePairingPhone } from "../helpers/PairingPhone";
import UpdateWhatsAppService from "../services/WhatsappService/UpdateWhatsAppService";

const store = async (req: Request, res: Response): Promise<Response> => {
  const { whatsappId } = req.params;
  const whatsapp = await ShowWhatsAppService(whatsappId);

  StartWhatsAppSession(whatsapp);

  return res.status(200).json({ message: "Starting session." });
};

const update = async (req: Request, res: Response): Promise<Response> => {
  const { whatsappId } = req.params;

  // `pairingPhone` switches the connection to the pairing code (a number) or back to the QR Code (empty); without it the same way is kept
  const asked = req.body && Object.prototype.hasOwnProperty.call(req.body, "pairingPhone");
  const phone = asked ? normalizePairingPhone(req.body.pairingPhone) : undefined;
  if (asked && req.body.pairingPhone && !phone) throw new AppError("ERR_INVALID_PHONE", 400);

  const { whatsapp } = await UpdateWhatsAppService({
    whatsappId,
    whatsappData: { session: "" }
  });
  if (asked) await whatsapp.update({ pairingPhone: phone || null, qrcode: "" });

  StartWhatsAppSession(whatsapp);

  return res.status(200).json({ message: "Starting session." });
};

const remove = async (req: Request, res: Response): Promise<Response> => {
  const { whatsappId } = req.params;
  const whatsapp = await ShowWhatsAppService(whatsappId);

  if (whatsapp.channel !== "whatsapp") {
    await getAdapter(whatsapp.channel).stop(whatsapp);
    await whatsapp.update({ status: "DISCONNECTED" });
    getIO().emit("whatsappSession", { action: "update", session: whatsapp });
  } else {
    await whatsappProvider.logout(whatsapp.id);
  }

  return res.status(200).json({ message: "Session disconnected." });
};

export default { store, remove, update };
