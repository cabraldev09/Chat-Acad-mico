import { Request, Response } from "express";
import startContactsImport from "../services/WbotServices/ImportContactsService";
import { getIO } from "../libs/socket";
import { logger } from "../utils/logger";

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
