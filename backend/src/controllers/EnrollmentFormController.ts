import { Request, Response } from "express";

import AppError from "../errors/AppError";
import Contact from "../models/Contact";
import EnrollmentForm from "../models/EnrollmentForm";
import Lead from "../models/Lead";
import Ticket from "../models/Ticket";
import Whatsapp from "../models/Whatsapp";
import SendToContact from "../services/ChannelServices/SendToContact";
import { addActivity, ensureLead, resolveLeadTarget } from "../services/CrmServices/LeadCore";
import * as Form from "../services/CrmServices/EnrollmentForm";

const uid = (req: Request): number => Number(req.user.id);

const leadOf = async (req: Request): Promise<Lead> => {
  const lead = await Lead.findByPk(req.params.id);
  if (!lead) throw new AppError("ERR_LEAD_NOT_FOUND", 404);
  return lead;
};
const currentOf = (leadId: number) => EnrollmentForm.findOne({ where: { leadId }, order: [["id", "DESC"]] });

// ---- the team (logged in, with access to the lead) ----

export const show = async (req: Request, res: Response): Promise<Response> => {
  const lead = await leadOf(req);
  return res.json(Form.staffView(await currentOf(lead.id)));
};

export const create = async (req: Request, res: Response): Promise<Response> => {
  const lead = await leadOf(req);
  return res.json(Form.staffView(await Form.formForLead(lead, uid(req))));
};

const sendLink = async (lead: Lead, form: EnrollmentForm, userId: number, target?: { contact: Contact; whatsapp: Whatsapp; ticketId: number }) => {
  const { contact, whatsapp } = target || (await resolveLeadTarget(lead, userId, null));
  await SendToContact({ contact, whatsapp, body: Form.linkMessage(lead, form), keepOpen: { userId }, ticketId: target ? target.ticketId : undefined, byPerson: true });
  form.set({ sentAt: new Date() } as any);
  await form.save();
  await addActivity(lead.id, userId, "whatsapp", `Link da ficha de matrícula enviado (${form.progress}% preenchida).`);
};

export const send = async (req: Request, res: Response): Promise<Response> => {
  const lead = await leadOf(req);
  if (lead.enrolledAt) throw new AppError("ERR_FORM_LOCKED", 409);
  const form = await Form.formForLead(lead, uid(req));
  await sendLink(lead, form, uid(req));
  return res.json(Form.staffView(form));
};

// from the conversation ("+" → Ficha de matrícula): the lead of this contact (created when there is none) gets the link in this conversation
export const sendFromTicket = async (req: Request, res: Response): Promise<Response> => {
  const ticket = await Ticket.findByPk(req.params.ticketId, { include: ["contact", "whatsapp"] });
  if (!ticket || !(ticket as any).contact || !(ticket as any).whatsapp) throw new AppError("ERR_NO_TICKET_FOUND", 404);
  if (ticket.isGroup) throw new AppError("ERR_FORM_GROUP", 400);
  const contact: Contact = (ticket as any).contact;
  const lead = (await Lead.findOne({ where: { contactId: contact.id }, order: [["updatedAt", "DESC"]] })) || (await ensureLead(contact, (ticket as any).whatsapp.channel || "whatsapp"));
  if (!lead) throw new AppError("ERR_FORM_NOT_A_LEAD", 400);
  if (lead.enrolledAt) throw new AppError("ERR_FORM_LOCKED", 409);
  const form = await Form.formForLead(lead, uid(req));
  await sendLink(lead, form, uid(req), { contact, whatsapp: (ticket as any).whatsapp, ticketId: ticket.id });
  return res.json({ ...Form.staffView(form), leadId: lead.id });
};

export const file = async (req: Request, res: Response): Promise<Response | void> => {
  const lead = await leadOf(req);
  const form = await currentOf(lead.id);
  if (!form) throw new AppError("ERR_NOT_FOUND", 404);
  const { bytes, mime, name } = Form.readFile(form, String(req.params.kind));
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Disposition", `${mime === "image/heic" ? "attachment" : "inline"}; filename="${encodeURIComponent(name)}"`);
  if (mime !== "application/pdf") res.setHeader("Content-Security-Policy", "default-src 'none'; img-src 'self'; sandbox");
  return res.type(mime).send(bytes);
};

export const erase = async (req: Request, res: Response): Promise<Response> => {
  const lead = await leadOf(req);
  const form = await currentOf(lead.id);
  if (!form) throw new AppError("ERR_NOT_FOUND", 404);
  await Form.eraseForm(form, uid(req));
  return res.json({ ok: true });
};

// ---- the personal link of the lead (no login: the long random code is the key) ----

export const publicShow = async (req: Request, res: Response): Promise<Response> => {
  const { form, lead } = await Form.formByToken(req.params.token);
  return res.json(await Form.publicView(form, lead));
};

export const publicSave = async (req: Request, res: Response): Promise<Response> => {
  const { form, lead } = await Form.formByToken(req.params.token);
  const body = req.body || {};
  return res.json(await Form.saveDraft(form, lead, body.data || {}, typeof body.consent === "boolean" ? body.consent : undefined));
};

export const publicFile = async (req: Request, res: Response): Promise<Response> => {
  const { form, lead } = await Form.formByToken(req.params.token);
  const upload = (req as any).file;
  if (!upload) throw new AppError("ERR_FORM_FILE_EMPTY", 400);
  return res.json(await Form.saveFile(form, lead, String(req.params.kind), upload.buffer, upload.originalname || ""));
};

export const publicRemoveFile = async (req: Request, res: Response): Promise<Response> => {
  const { form, lead } = await Form.formByToken(req.params.token);
  return res.json(await Form.removeFile(form, lead, String(req.params.kind)));
};

export const publicSubmit = async (req: Request, res: Response): Promise<Response> => {
  const { form, lead } = await Form.formByToken(req.params.token);
  return res.json(await Form.submitForm(form, lead));
};
