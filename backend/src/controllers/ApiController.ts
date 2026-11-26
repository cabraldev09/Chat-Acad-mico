import fs from "fs";
import { Request, Response } from "express";
import * as Yup from "yup";
import AppError from "../errors/AppError";
import GetDefaultWhatsApp from "../helpers/GetDefaultWhatsApp";
import { assertTokenCanSend } from "../helpers/ApiPoloSend";
import { apiCaller } from "../middleware/apiScope";
import SetTicketMessagesAsRead from "../helpers/SetTicketMessagesAsRead";
import Message from "../models/Message";
import Ticket from "../models/Ticket";
import Whatsapp from "../models/Whatsapp";
import CreateOrUpdateContactService from "../services/ContactServices/CreateOrUpdateContactService";
import FindOrCreateTicketService from "../services/TicketServices/FindOrCreateTicketService";
import ShowTicketService from "../services/TicketServices/ShowTicketService";
import CheckIsValidContact from "../services/WbotServices/CheckIsValidContact";
import CheckContactNumber from "../services/WbotServices/CheckNumber";
import GetProfilePicUrl from "../services/WbotServices/GetProfilePicUrl";
import SendWhatsAppMedia from "../services/WbotServices/SendWhatsAppMedia";
import SendWhatsAppMessage from "../services/WbotServices/SendWhatsAppMessage";

type WhatsappData = {
  whatsappId: number;
};

type MessageData = {
  body: string;
  fromMe: boolean;
  read: boolean;
  quotedMsg?: Message;
};

interface ContactData {
  number: string;
}

const createContact = async (
  whatsappId: number | undefined,
  newContact: string
) => {
  await CheckIsValidContact(newContact);

  const validNumber: any = await CheckContactNumber(newContact);

  const profilePicUrl = await GetProfilePicUrl(validNumber);

  const number = validNumber;

  const contactData = {
    name: `${number}`,
    number,
    profilePicUrl,
    isGroup: false
  };

  const contact = await CreateOrUpdateContactService(contactData);

  let whatsapp: Whatsapp | null;

  if (whatsappId === undefined) {
    whatsapp = await GetDefaultWhatsApp();
  } else {
    whatsapp = await Whatsapp.findByPk(whatsappId);

    if (whatsapp === null) {
      throw new AppError(`whatsapp #${whatsappId} not found`);
    }
  }

  const createTicket = await FindOrCreateTicketService(contact, whatsapp.id, 1);

  const ticket = await ShowTicketService(createTicket.id);

  SetTicketMessagesAsRead(ticket);

  return ticket;
};

// the files multer already wrote to public/ when the call is refused before anything is sent (a refused call leaves no file behind)
const discardUploads = async (files: Express.Multer.File[] | undefined): Promise<void> => {
  await Promise.all((files || []).map(f => (f && f.path ? fs.promises.unlink(f.path).catch(() => undefined) : undefined)));
};

export const index = async (req: Request, res: Response): Promise<Response> => {
  const newContact: ContactData = req.body;
  const { whatsappId }: WhatsappData = req.body;
  const { body, quotedMsg }: MessageData = req.body;
  const medias = req.files as Express.Multer.File[];

  let contactAndTicket: Ticket;
  try {
    newContact.number = newContact.number.replace("-", "").replace(" ", "");

    const schema = Yup.object().shape({
      number: Yup.string()
        .required()
        .matches(/^\d+$/, "Invalid number format. Only numbers is allowed.")
    });

    try {
      await schema.validate(newContact);
    } catch (err: any) {
      throw new AppError(err.message);
    }

    // a token of some polos: only people and connections of its polos (nothing is created before this answer)
    await assertTokenCanSend(apiCaller(req), newContact.number, whatsappId);

    contactAndTicket = await createContact(whatsappId, newContact.number);
  } catch (err) {
    await discardUploads(medias);
    throw err;
  }

  if (medias) {
    await Promise.all(
      medias.map(async (media: Express.Multer.File) => {
        await SendWhatsAppMedia({ body, media, ticket: contactAndTicket });
      })
    );
  } else {
    await SendWhatsAppMessage({ body, ticket: contactAndTicket, quotedMsg });
  }

  return res.send();
};
