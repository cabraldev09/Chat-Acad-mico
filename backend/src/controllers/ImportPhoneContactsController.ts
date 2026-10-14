import { Request, Response } from "express";
import ImportContactsService from "../services/WbotServices/ImportContactsService";

export const store = async (req: Request, res: Response): Promise<Response> => {
  const userId: number = parseInt(req.user.id);
  const imported = await ImportContactsService(userId, req.body && req.body.whatsappId ? Number(req.body.whatsappId) : undefined);

  return res.status(200).json({ message: "contacts imported", imported });
};
