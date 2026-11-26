import { Op, literal } from "sequelize";
import { isManagerRole, roleOf } from "../helpers/Roles";
import { hasContactAccess } from "../middleware/canAccessContact";
import { crmPolosOf } from "../middleware/scope";
import { contactPoloSql } from "../helpers/TicketPoloScope";
import { assertOutboundTarget } from "../middleware/outboundScope";
import { publicFile } from "../helpers/PublicFile";
import { Request, Response } from "express";
import Schedule from "../models/Schedule";
import Contact from "../models/Contact";
import AppError from "../errors/AppError";
import makeCrud from "./crudFactory";
import { cleanSteps } from "../helpers/CampaignText";

// The administration: every scheduled message. The coordination: the ones it made and the ones for people of its polos (a lead there, or a conversation
// in a queue there; a person with no polo is the administration's). The others: only their own.
const authorize = async (req: Request, row: Schedule): Promise<void> => {
  if (roleOf(req.user as any) === "coordenacao") {
    if (row.userId === Number(req.user.id) || (await hasContactAccess(req, row.contactId))) return;
    throw new AppError("ERR_NO_PERMISSION", 403);
  }
  if (!isManagerRole(roleOf(req.user as any)) && row.userId !== Number(req.user.id)) throw new AppError("ERR_NO_PERMISSION", 403);
};

const crud = makeCrud(Schedule, {
  event: "schedule",
  authorize,
  fields: ["body", "sendAt", "contactId", "ticketId", "whatsappId", "mediaUrl", "steps"],
  required: ["sendAt", "contactId"],
  include: [{ model: Contact, as: "contact", attributes: ["id", "name", "number"] }],
  order: [["sendAt", "ASC"]],
  beforeSave: async (data, req, existing) => {
    if (existing && existing.status !== "pending") throw new AppError("ERR_SCHEDULE_NOT_PENDING", 400);
    const target = { ...(existing ? existing.toJSON() : {}), ...data };
    await assertOutboundTarget(req, target);
    // the messages: a sequence (steps) or a single text; the first one stays in body/mediaUrl for the older screens
    if (data.steps !== undefined && data.steps !== null) {
      const steps = cleanSteps(data.steps);
      data.steps = steps;
      data.body = steps[0].body;
      data.mediaUrl = steps[0].mediaUrl;
    } else if (!existing && !String(data.body || "").trim() && !data.mediaUrl) {
      throw new AppError("ERR_FIELD_REQUIRED_body");
    }
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
  where: async (req: Request) => {
    const polos = await crmPolosOf(req);
    // in the SQL of the list (never after the page): the coordination's own plus the ones for contacts of its polos
    const where: any = polos
      ? { [Op.or]: [{ userId: Number(req.user.id) }, literal(`EXISTS (SELECT 1 FROM "Contacts" "sc" WHERE "sc"."id" = "Schedule"."contactId" AND ${contactPoloSql(polos, false, "sc")})`)] }
      : isManagerRole(roleOf(req.user as any)) ? {} : { userId: Number(req.user.id) };
    const extra: any = {};
    if (req.query.contactId) extra.contactId = req.query.contactId;
    if (req.query.ticketId) extra.ticketId = req.query.ticketId;
    if (req.query.status) extra.status = req.query.status;
    return Object.keys(extra).length ? { [Op.and]: [where, extra] } : where;
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
