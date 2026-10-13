import fs from "fs";
import { PUBLIC_DIR } from "../../config/paths";
import path from "path";

import Contact from "../../models/Contact";
import Message from "../../models/Message";
import Whatsapp from "../../models/Whatsapp";
import AppError from "../../errors/AppError";
import { mimeFromName } from "../../helpers/MimeFromName";
import FindOrCreateTicketService from "../TicketServices/FindOrCreateTicketService";
import ShowTicketService from "../TicketServices/ShowTicketService";
import UpdateTicketService from "../TicketServices/UpdateTicketService";
import SendWhatsAppMessage from "../WbotServices/SendWhatsAppMessage";
import SendWhatsAppMedia from "../WbotServices/SendWhatsAppMedia";
import CreateMessageService from "../MessageServices/CreateMessageService";
import { getAdapter } from "../../channels";



interface Input {
  contact: Contact;
  whatsapp: Whatsapp;
  body: string;
  mediaUrl?: string | null;
  template?: { name: string; language: string; params: string[] } | null;
  // keep the conversation open (assigned) instead of closing a ticket we created
  keepOpen?: { userId: number } | null;
}

// Sends an outbound (agent/system initiated) message to a contact through any
// channel, opening a ticket for the conversation when none is open. Tickets
// created only to deliver the message are closed again, so a campaign does not
// fill the inbox; a reply from the contact reopens them as pending.
const SendToContact = async ({
  contact,
  whatsapp,
  body,
  mediaUrl,
  template,
  keepOpen
}: Input): Promise<void> => {
  const found = await FindOrCreateTicketService(contact, whatsapp.id, 0);
  const ticket = await ShowTicketService(found.id);
  const hadMessages = (await Message.count({ where: { ticketId: ticket.id } })) > 0;

  if (template && whatsapp.channel === "whatsapp_cloud") {
    const adapter = getAdapter("whatsapp_cloud");
    if (!adapter.sendTemplate) throw new AppError("ERR_TEMPLATES_UNSUPPORTED");
    const sent = await adapter.sendTemplate(whatsapp, ticket.contact as any, template);
    await CreateMessageService({
      messageData: {
        id: sent.id,
        ticketId: ticket.id,
        body: body || `[Modelo: ${template.name}]`,
        fromMe: true,
        read: true,
        mediaType: "chat",
        ack: 1
      }
    });
    await ticket.update({ lastMessage: body || `[Modelo: ${template.name}]` });
  } else if (mediaUrl) {
    const source = path.join(PUBLIC_DIR, mediaUrl);
    if (!fs.existsSync(source)) throw new AppError("ERR_MEDIA_NOT_FOUND");
    // SendWhatsAppMedia consumes (deletes) the file it sends, so hand it a copy
    const copyName = `send-${Date.now()}-${Math.random().toString(36).slice(2, 6)}${path.extname(mediaUrl)}`;
    fs.copyFileSync(source, path.join(PUBLIC_DIR, copyName));
    await SendWhatsAppMedia({
      media: {
        filename: copyName,
        originalname: mediaUrl,
        mimetype: mimeFromName(mediaUrl),
        path: path.join(PUBLIC_DIR, copyName)
      } as Express.Multer.File,
      ticket,
      body,
      automated: !keepOpen
    });
  } else {
    await SendWhatsAppMessage({ body, ticket, automated: !keepOpen });
  }

  if (keepOpen) {
    if (ticket.status !== "open" || !ticket.userId) {
      await UpdateTicketService({
        ticketData: { status: "open", userId: keepOpen.userId },
        ticketId: ticket.id
      });
    }
  } else if (!hadMessages && !ticket.userId) {
    await UpdateTicketService({
      ticketData: { status: "closed" },
      ticketId: ticket.id
    });
  }
};

export default SendToContact;
