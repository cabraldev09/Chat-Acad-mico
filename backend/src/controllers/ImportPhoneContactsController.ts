import { Request, Response } from "express";
import startContactsImport from "../services/WbotServices/ImportContactsService";
import { getIO } from "../libs/socket";
import { logger } from "../utils/logger";
import AppError from "../errors/AppError";
import Whatsapp from "../models/Whatsapp";
import { copyEnabled, startHistoryImport, isHistoryRunning } from "../services/WbotServices/ImportHistoryService";

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
  if (!(await copyEnabled())) throw new AppError("ERR_HISTORY_COPY_OFF", 409);

  startHistoryImport(whatsapp, userId, {
    perChat: Number(req.body?.perChat) || 60,
    includeGroups: req.body?.includeGroups !== false
  });

  return res.status(202).json({ started: true, connection: whatsapp.name });
};

// "Apagar o que foi copiado deste número" (administration): the conversations copied from the phone that nobody used (still history)
// and their messages leave the system; the number is marked as copied, so the copy does not run again by itself
export const eraseCopied = async (req: Request, res: Response): Promise<Response> => {
  const whatsapp = await Whatsapp.findByPk(req.params.whatsappId);
  if (!whatsapp || (whatsapp.channel || "whatsapp") !== "whatsapp") throw new AppError("ERR_NO_WAPP_FOUND", 404);
  if (isHistoryRunning(whatsapp.id)) throw new AppError("ERR_HISTORY_RUNNING", 409);
  const sequelize = (await import("../database")).default;
  const { QueryTypes } = await import("sequelize");
  const { portable } = await import("../helpers/sqlDialect");
  const ids = ((await sequelize.query(portable(`SELECT id FROM Tickets WHERE whatsappId = :id AND isHistorical = true`), { replacements: { id: whatsapp.id }, type: QueryTypes.SELECT })) as any[]).map(r => Number(r.id));
  let messages = 0;
  if (ids.length) {
    await sequelize.transaction(async transaction => {
      const run = (sql: string) => sequelize.query(portable(sql), { replacements: { ids }, transaction });
      const [, meta]: any = await run(`DELETE FROM Messages WHERE ticketId IN (:ids)`);
      messages = Number(meta?.rowCount ?? meta ?? 0) || 0;
      for (const table of ["TicketPins", "TicketTags", "TicketEvents"]) {
        // eslint-disable-next-line no-await-in-loop
        await run(`DELETE FROM ${table} WHERE ticketId IN (:ids)`);
      }
      await run(`DELETE FROM Tickets WHERE id IN (:ids)`);
    });
  }
  await whatsapp.update({ historyImportedAt: new Date() } as any);
  logger.warn(`Cópia do WhatsApp apagada: número ${whatsapp.id}, ${ids.length} conversas`);
  getIO().emit("ticket", { action: "refresh" });
  return res.json({ conversations: ids.length, messages });
};
