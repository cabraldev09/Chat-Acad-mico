import { Request, Response } from "express";
import Tag from "../models/Tag";
import Ticket from "../models/Ticket";
import Contact from "../models/Contact";
import AppError from "../errors/AppError";
import { getIO } from "../libs/socket";
import makeCrud from "./crudFactory";

const crud = makeCrud(Tag, {
  event: "tag",
  fields: ["name", "color"],
  required: ["name", "color"],
  order: [["name", "ASC"]]
});

export const { index, show, store, update, remove } = crud;

export const setTicketTags = async (req: Request, res: Response): Promise<Response> => {
  const ticket = await Ticket.findByPk(req.params.ticketId);
  if (!ticket) throw new AppError("ERR_NO_TICKET_FOUND", 404);
  const tagIds: number[] = (req.body.tagIds || []).map(Number);
  await (ticket as any).$set("tags", tagIds);
  const tags = await (ticket as any).$get("tags", { attributes: ["id", "name", "color"], joinTableAttributes: [] });
  getIO()
    .to(ticket.status)
    .to(String(ticket.id))
    .emit("ticket", { action: "tags", ticketId: ticket.id, tags });
  return res.json({ ticketId: ticket.id, tags });
};

export const setContactTags = async (req: Request, res: Response): Promise<Response> => {
  const contact = await Contact.findByPk(req.params.contactId);
  if (!contact) throw new AppError("ERR_NO_CONTACT_FOUND", 404);
  const tagIds: number[] = (req.body.tagIds || []).map(Number);
  await (contact as any).$set("tags", tagIds);
  const tags = await (contact as any).$get("tags", { attributes: ["id", "name", "color"], joinTableAttributes: [] });
  return res.json({ contactId: contact.id, tags });
};

export const contactTags = async (req: Request, res: Response): Promise<Response> => {
  const contact = await Contact.findByPk(req.params.contactId);
  if (!contact) throw new AppError("ERR_NO_CONTACT_FOUND", 404);
  const tags = await (contact as any).$get("tags", { attributes: ["id", "name", "color"], joinTableAttributes: [] });
  return res.json(tags);
};
