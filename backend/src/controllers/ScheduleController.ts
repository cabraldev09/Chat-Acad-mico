import { isManagerRole } from "../helpers/Roles";
import { assertOutboundTarget } from "../middleware/outboundScope";
import { publicFile } from "../helpers/PublicFile";
import { Request, Response } from "express";
import Schedule from "../models/Schedule";
import Contact from "../models/Contact";
import AppError from "../errors/AppError";
import makeCrud from "./crudFactory";

const authorize = async (req: Request, row: Schedule): Promise<void> => {
  if (!isManagerRole(req.user.role) && row.userId !== Number(req.user.id)) throw new AppError("ERR_NO_PERMISSION", 403);
};

const crud = makeCrud(Schedule, {
  event: "schedule",
  authorize,
  fields: ["body", "sendAt", "contactId", "ticketId", "whatsappId", "mediaUrl"],
  required: ["body", "sendAt", "contactId"],
  include: [{ model: Contact, as: "contact", attributes: ["id", "name", "number"] }],
  order: [["sendAt", "ASC"]],
  beforeSave: async (data, req, existing) => {
    if (existing && existing.status !== "pending") throw new AppError("ERR_SCHEDULE_NOT_PENDING", 400);
    const target = { ...(existing ? existing.toJSON() : {}), ...data };
    await assertOutboundTarget(req, target);
    if (data.mediaUrl) publicFile(data.mediaUrl);
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
    const where: any = isManagerRole(req.user.role) ? {} : { userId: Number(req.user.id) };
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
  await authorize(req, row);
  if (row.status !== "pending") throw new AppError("ERR_SCHEDULE_NOT_PENDING");
  await row.update({ status: "cancelled" });
  const { getIO } = await import("../libs/socket");
  getIO().emit("schedule", { action: "update", row });
  return res.json(row);
};
