import { Request, Response } from "express";
import startContactsImport from "../services/WbotServices/ImportContactsService";
import { getIO } from "../libs/socket";
import { logger } from "../utils/logger";
import AppError from "../errors/AppError";
import Whatsapp from "../models/Whatsapp";
import { startHistoryImport, isHistoryRunning } from "../services/WbotServices/ImportHistoryService";

// Reading the address book can take a while, so it runs in the background and the result arrives by socket.
export const store = async (req: Request, res: Response): Promise<Response> => {
  const userId: number = parseInt(req.user.id);
  const whatsappId = req.body && req.body.whatsappId ? Number(req.body.whatsappId) : undefined;
  const { connection, run } = await startContactsImport(userId, whatsappId);

  run()
    .then(report => getIO().emit("contactsImport", { userId, ok: true, ...report }))
    .catch(err => {
      logger.error({ info: "Contacts import failed", err: String(err) });
      getIO().emit("contactsImport", { userId, ok: false, message: err?.message || "ERR_IMPORT" });
    });

  return res.status(202).json({ started: true, connection: connection.name });
};

// Copies the conversations that already exist on the phone, as history (see ImportHistoryService)
export const history = async (req: Request, res: Response): Promise<Response> => {
  const userId: number = parseInt(req.user.id);
  const whatsapp = await Whatsapp.findByPk(req.params.whatsappId);
  if (!whatsapp || (whatsapp.channel || "whatsapp") !== "whatsapp") throw new AppError("ERR_NO_WAPP_FOUND", 404);
  if (whatsapp.status !== "CONNECTED") throw new AppError("ERR_WAPP_NOT_INITIALIZED", 400);
  if (isHistoryRunning(whatsapp.id)) throw new AppError("ERR_HISTORY_RUNNING", 409);

  startHistoryImport(whatsapp, userId, {
    perChat: Number(req.body?.perChat) || 60,
    includeGroups: req.body?.includeGroups !== false
  });

  return res.status(202).json({ started: true, connection: whatsapp.name });
};
