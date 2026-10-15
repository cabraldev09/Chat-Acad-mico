import { fire } from "../helpers/Fire";
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
  const beforeTicket = ((await (ticket as any).$get("tags", { attributes: ["id"], joinTableAttributes: [] })) as Tag[]).map(t => t.id);
  await (ticket as any).$set("tags", tagIds);
  tagIds.filter(t => !beforeTicket.includes(t)).forEach(tagId => fire("tag.added", { ticketId: ticket.id, contactId: ticket.contactId, tagId }));
  beforeTicket.filter(t => !tagIds.includes(t)).forEach(tagId => fire("tag.removed", { ticketId: ticket.id, contactId: ticket.contactId, tagId }));
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
  const beforeContact = ((await (contact as any).$get("tags", { attributes: ["id"], joinTableAttributes: [] })) as Tag[]).map(t => t.id);
  await (contact as any).$set("tags", tagIds);
  tagIds.filter(t => !beforeContact.includes(t)).forEach(tagId => fire("tag.added", { contactId: contact.id, tagId }));
  beforeContact.filter(t => !tagIds.includes(t)).forEach(tagId => fire("tag.removed", { contactId: contact.id, tagId }));
  const tags = await (contact as any).$get("tags", { attributes: ["id", "name", "color"], joinTableAttributes: [] });
  return res.json({ contactId: contact.id, tags });
};

export const contactTags = async (req: Request, res: Response): Promise<Response> => {
  const contact = await Contact.findByPk(req.params.contactId);
  if (!contact) throw new AppError("ERR_NO_CONTACT_FOUND", 404);
  const tags = await (contact as any).$get("tags", { attributes: ["id", "name", "color"], joinTableAttributes: [] });
  return res.json(tags);
};
