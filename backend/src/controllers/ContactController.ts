import { getAppTz } from "../helpers/AppTime";
import * as Yup from "yup";
import { Request, Response } from "express";
import { getIO } from "../libs/socket";

import ListContactsService, { contactsSearchWhere } from "../services/ContactServices/ListContactsService";
import ContactTag from "../models/ContactTag";
import Tag from "../models/Tag";
import { Op } from "sequelize";
import { csvAsText, csvDay, csvBody } from "../helpers/Csv";
import { roleOf } from "../helpers/Roles";
import { connectionScopeOf, contactScopeWhere } from "../helpers/ConnectionScope";
import { RELATIONS, Relation, applyRelation } from "../services/CrmServices/Relation";
import CreateContactService from "../services/ContactServices/CreateContactService";
import ShowContactService from "../services/ContactServices/ShowContactService";
import UpdateContactService from "../services/ContactServices/UpdateContactService";
import DeleteContactService from "../services/ContactServices/DeleteContactService";

import CheckContactNumber from "../services/WbotServices/CheckNumber";
import CheckIsValidContact from "../services/WbotServices/CheckIsValidContact";
import GetProfilePicUrl from "../services/WbotServices/GetProfilePicUrl";
import AppError from "../errors/AppError";
import GetContactService from "../services/ContactServices/GetContactService";
import Contact from "../models/Contact";
import Lead from "../models/Lead";
import Ticket from "../models/Ticket";

type IndexQuery = {
  searchParam: string;
  pageNumber: string;
};

type IndexGetContactQuery = {
  name: string;
  number: string;
};

interface ExtraInfo {
  name: string;
  value: string;
}
interface ContactData {
  name: string;
  number: string;
  email?: string;
  extraInfo?: ExtraInfo[];
}

export const index = async (req: Request, res: Response): Promise<Response> => {
  const { searchParam, pageNumber } = req.query as IndexQuery;

  const { contacts, count, hasMore } = await ListContactsService({
    searchParam,
    pageNumber,
    scope: contactScopeWhere(await connectionScopeOf(req.user.id, roleOf(req.user)), req.user.id)
  });

  return res.json({ contacts, count, hasMore });
};

const KIND_LABEL: Record<string, string> = { person: "Pessoa", group: "Grupo", channel: "Canal", business: "Empresa" };
const EXPORT_LIMIT = 100000;

// The list of contacts as a spreadsheet (opens in Excel): the same search as the screen. Groups and channels stay out unless
// asked for (`groups=1`). Management and consultants only: the tutor works with the students, not with the whole list.
export const exportCsv = async (req: Request, res: Response): Promise<Response> => {
  if (!["admin", "coordenacao", "consultor"].includes(roleOf(req.user))) throw new AppError("ERR_NO_PERMISSION", 403);
  const searchParam = String(req.query.searchParam || "");
  const withGroups = req.query.groups === "1";
  const groupScope = contactScopeWhere(await connectionScopeOf(req.user.id, roleOf(req.user)), req.user.id);
  const where: any = {
    [Op.and]: [contactsSearchWhere(searchParam), ...(groupScope ? [groupScope] : []), ...(withGroups ? [] : [{ isGroup: false }, { kind: { [Op.in]: ["person", "business"] } }])]
  };

  const rows: Contact[] = [];
  for (let offset = 0; offset < EXPORT_LIMIT; offset += 1000) {
    // eslint-disable-next-line no-await-in-loop
    const page = await Contact.findAll({ where, order: [["id", "ASC"]], limit: 1000, offset });
    rows.push(...page);
    if (page.length < 1000) break;
  }

  // labels of all of them, in one query
  const tagsOf = new Map<number, string[]>();
  for (let i = 0; i < rows.length; i += 2000) {
    const ids = rows.slice(i, i + 2000).map(c => c.id);
    // eslint-disable-next-line no-await-in-loop
    const links = await ContactTag.findAll({ where: { contactId: { [Op.in]: ids } }, attributes: ["contactId", "tagId"], raw: true });
    // eslint-disable-next-line no-await-in-loop
    const tags = await Tag.findAll({ where: { id: { [Op.in]: [...new Set(links.map((l: any) => l.tagId))] } }, attributes: ["id", "name"], raw: true });
    const nameOf = new Map<number, string>(tags.map((t: any) => [t.id, t.name]));
    links.forEach((l: any) => tagsOf.set(l.contactId, [...(tagsOf.get(l.contactId) || []), nameOf.get(l.tagId) || ""].filter(Boolean)));
  }

  const body = csvBody(
    ["Nome", "WhatsApp", "E-mail", "Tipo", "Relação", "Canal", "Etiquetas", "Criado em"],
    rows.map(c => [
      c.name || "",
      csvAsText(c.number),
      c.email || "",
      c.isGroup ? "Grupo" : KIND_LABEL[c.kind] || "Pessoa",
      c.isStaff ? "Equipe" : c.isPersonal ? "Amigo ou pessoal" : "Cliente",
      c.channel || "whatsapp",
      (tagsOf.get(c.id) || []).sort((a, b) => a.localeCompare(b, "pt-BR")).join(", "),
      csvDay(c.createdAt)
    ])
  );
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="contatos-${new Date().toLocaleDateString("en-CA", { timeZone: getAppTz() })}.csv"`);
  return res.send(body);
};

export const getContact = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { name, number } = req.body as IndexGetContactQuery;

  const contact = await GetContactService({
    name,
    number
  });

  return res.status(200).json(contact);
};

export const store = async (req: Request, res: Response): Promise<Response> => {
  const newContact: ContactData = req.body;
  newContact.number = newContact.number.replace("-", "").replace(" ", "");

  const schema = Yup.object().shape({
    name: Yup.string().required(),
    number: Yup.string()
      .required()
      .matches(/^\d+$/, "Invalid number format. Only numbers is allowed.")
  });

  try {
    await schema.validate(newContact);
  } catch (err) {
    throw new AppError(err.message);
  }

  await CheckIsValidContact(newContact.number);
  const validNumber: any = await CheckContactNumber(newContact.number);

  const profilePicUrl = await GetProfilePicUrl(validNumber);

  let name = newContact.name;
  let number = validNumber;
  let email = newContact.email;
  let extraInfo = newContact.extraInfo;

  const contact = await CreateContactService({
    name,
    number,
    email,
    extraInfo,
    profilePicUrl
  });

  const io = getIO();
  io.emit("contact", {
    action: "create",
    contact
  });

  return res.status(200).json(contact);
};

export const show = async (req: Request, res: Response): Promise<Response> => {
  const { contactId } = req.params;

  const contact = await ShowContactService(contactId);

  return res.status(200).json(contact);
};

export const update = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const contactData: ContactData = req.body;

  const schema = Yup.object().shape({
    name: Yup.string(),
    number: Yup.string().matches(
      /^\d+$/,
      "Invalid number format. Only numbers is allowed."
    )
  });

  try {
    await schema.validate(contactData);
  } catch (err) {
    throw new AppError(err.message);
  }

  const { contactId } = req.params;

  // the number is only checked at WhatsApp when it changed: renaming a contact must work with the number disconnected
  const current = await Contact.findByPk(contactId, { attributes: ["id", "number"] });
  if (!current) throw new AppError("ERR_NO_CONTACT_FOUND", 404);
  if (contactData.number && String(contactData.number) !== String(current.number)) {
    await CheckIsValidContact(contactData.number);
  }

  const contact = await UpdateContactService({ contactData, contactId });

  const io = getIO();
  io.emit("contact", {
    action: "update",
    contact
  });

  return res.status(200).json(contact);
};

export const remove = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { contactId } = req.params;

  await DeleteContactService(contactId);

  const io = getIO();
  io.emit("contact", {
    action: "delete",
    contactId
  });

  return res.status(200).json({ message: "Contact deleted" });
};

// Marks a person as part of the team (employee), with or without a login. A team member's conversations and
// leads never count in statistics or the CRM funnel; the conversation itself stays as it is.
export const setStaff = async (req: Request, res: Response): Promise<Response> => {
  const contact = await Contact.findByPk(req.params.contactId);
  if (!contact) throw new AppError("ERR_NO_CONTACT_FOUND", 404);
  if (contact.isGroup) throw new AppError("ERR_STAFF_GROUP", 400);
  const isStaff = Boolean(req.body.isStaff);
  // taking the mark off a team member makes them a customer again; a friend is not touched by this
  if (isStaff) await applyRelation(contact, "staff");
  else if (contact.isStaff) await applyRelation(contact, "customer");
  return res.status(200).json(contact);
};

// Who the person is for us: customer, friend/family or team. A friend or a team member leaves the CRM funnel and the numbers.
export const setRelation = async (req: Request, res: Response): Promise<Response> => {
  const contact = await Contact.findByPk(req.params.contactId);
  if (!contact) throw new AppError("ERR_NO_CONTACT_FOUND", 404);
  if (contact.isGroup) throw new AppError("ERR_STAFF_GROUP", 400);
  const relation = String(req.body.relation) as Relation;
  if (!RELATIONS.includes(relation)) throw new AppError("ERR_INVALID_PARAMETER", 400);
  await applyRelation(contact, relation);
  return res.status(200).json(contact);
};

// A group of a WhatsApp Community: it goes to the Comunidades view and stays out of the customer numbers. Marked by hand
// when the automatic detection did not tell (or to take it back).
export const setCommunity = async (req: Request, res: Response): Promise<Response> => {
  const contact = await Contact.findByPk(req.params.contactId);
  if (!contact) throw new AppError("ERR_NO_CONTACT_FOUND", 404);
  if (!contact.isGroup) throw new AppError("ERR_COMMUNITY_NOT_GROUP", 400);
  const community = Boolean(req.body.community);
  await contact.update({ kind: community ? "community" : "group", ...(community ? {} : { communityRole: null, communityId: null, parentGroupId: null }), ...(req.body.readOnly !== undefined ? { readOnly: Boolean(req.body.readOnly) } : {}) });
  getIO().emit("contact", { action: "update", contact });
  return res.status(200).json(contact);
};

// "Does not need an answer": the person (a notice, a broadcast) stops showing in the dashboard's "no answer" list
export const setNoReply = async (req: Request, res: Response): Promise<Response> => {
  const contact = await Contact.findByPk(req.params.contactId);
  if (!contact) throw new AppError("ERR_NO_CONTACT_FOUND", 404);
  await contact.update({ noReply: Boolean(req.body.noReply) });
  getIO().emit("contact", { action: "update", contact });
  return res.status(200).json(contact);
};
