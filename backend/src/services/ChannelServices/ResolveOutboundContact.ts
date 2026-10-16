import { Op } from "sequelize";

import Contact from "../../models/Contact";
import Message from "../../models/Message";
import Ticket from "../../models/Ticket";
import Whatsapp from "../../models/Whatsapp";
import { getIO } from "../../libs/socket";
import { logger } from "../../utils/logger";
import { whatsappProvider } from "../../providers/WhatsApp";
import { findOrCreateChannelContact } from "../InboundServices/HandleChannelMessage";
import CreateOrUpdateContactService from "../ContactServices/CreateOrUpdateContactService";
import { splitRegistered } from "../../helpers/RegisteredNumber";

// A contact that an older version created from the internal id, stored as if it were the phone, is the same person as
// the real contact: its empty conversations are dropped, the ones with messages move to the real contact.
const absorbIdContact = async (real: Contact, lid: string): Promise<void> => {
  try {
    const old = await Contact.findOne({ where: { number: lid, id: { [Op.ne]: real.id }, isGroup: false } });
    if (!old || (old.lid && old.lid !== lid)) return;
    const tickets = await Ticket.findAll({ where: { contactId: old.id }, attributes: ["id"] });
    for (const t of tickets) {
      // eslint-disable-next-line no-await-in-loop
      const messages = await Message.count({ where: { ticketId: t.id } });
      // eslint-disable-next-line no-await-in-loop
      if (messages === 0) await Ticket.destroy({ where: { id: t.id } });
      // eslint-disable-next-line no-await-in-loop
      else await Ticket.update({ contactId: real.id }, { where: { id: t.id } });
    }
    await old.destroy();
    logger.info({ real: real.id, absorbed: old.id }, "Contact stored by WhatsApp internal id merged into the real contact");
    getIO().emit("contact", { action: "delete", contactId: old.id });
  } catch (err) {
    logger.warn(`Could not merge the contact stored by internal id: ${err}`);
  }
};

// Finds (or creates) the contact to message by phone number on a connection.
// Only phone based channels can start a conversation from just a number.
export const resolveOutboundContact = async (whatsapp: Whatsapp, number: string, name: string) => {
  if (whatsapp.channel === "whatsapp") {
    const digits = number.replace(/\D/g, "");
    const valid = await whatsappProvider.checkNumber(whatsapp.id, digits);
    const { phone, lid } = splitRegistered(digits, valid);
    // the person may already be in the address book (by either form of the phone, or by the internal id): use that one
    const existing = await Contact.findOne({
      where: { isGroup: false, [Op.or]: [{ number: { [Op.in]: [...new Set([phone, digits])] } }, ...(lid ? [{ lid }] : [])] },
      order: [["id", "ASC"]]
    });
    if (existing) {
      if (lid && existing.lid !== lid) await existing.update({ lid });
      if (lid) await absorbIdContact(existing, lid);
      return existing;
    }
    // the same service the incoming messages use: it joins a contact known by phone with one known by internal id
    const contact = await CreateOrUpdateContactService({ name: name || phone, number: phone, lid, isGroup: false });
    if (!contact.channel) await contact.update({ channel: "whatsapp" });
    if (lid) await absorbIdContact(contact, lid);
    return contact;
  }
  if (whatsapp.channel === "whatsapp_cloud") {
    const digits = number.replace(/\D/g, "");
    return findOrCreateChannelContact(whatsapp, digits, name || digits);
  }
  // other channels cannot start a conversation from a phone number
  throw new Error("channel does not support outbound campaigns");
};

