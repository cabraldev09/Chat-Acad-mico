import { Request, Response } from "express";
import Schedule from "../models/Schedule";
import Contact from "../models/Contact";
import AppError from "../errors/AppError";
import makeCrud from "./crudFactory";

const crud = makeCrud(Schedule, {
  event: "schedule",
  fields: ["body", "sendAt", "contactId", "ticketId", "whatsappId", "mediaUrl"],
  required: ["body", "sendAt", "contactId"],
  include: [{ model: Contact, as: "contact", attributes: ["id", "name", "number"] }],
  order: [["sendAt", "ASC"]],
  beforeSave: (data, req, existing) => {
    if (data.sendAt) {
      const d = new Date(data.sendAt);
      if (Number.isNaN(d.getTime())) throw new AppError("ERR_SCHEDULE_DATE_INVALID");
      if (!existing && d.getTime() < Date.now() - 60000) {
        throw new AppError("ERR_SCHEDULE_IN_PAST");
      }
      data.sendAt = d;
    }
    if (!existing) {
      data.userId = Number(req.user.id);
      data.status = "pending";
    }
    ["ticketId", "whatsappId"].forEach(k => {
      if (data[k] === "" || data[k] === 0) data[k] = null;
    });
    return data;
  },
  where: req => {
    const where: any = {};
    if (req.query.contactId) where.contactId = req.query.contactId;
    if (req.query.ticketId) where.ticketId = req.query.ticketId;
    if (req.query.status) where.status = req.query.status;
    return where;
  }
});

export const { index, show, store, update, remove } = crud;

export const cancel = async (req: Request, res: Response): Promise<Response> => {
  const row = await Schedule.findByPk(req.params.id);
  if (!row) throw new AppError("ERR_NOT_FOUND", 404);
  if (row.status !== "pending") throw new AppError("ERR_SCHEDULE_NOT_PENDING");
  await row.update({ status: "cancelled" });
  return res.json(row);
};
