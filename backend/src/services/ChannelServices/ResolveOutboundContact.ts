import Contact from "../../models/Contact";
import Whatsapp from "../../models/Whatsapp";
import { getIO } from "../../libs/socket";
import { whatsappProvider } from "../../providers/WhatsApp";
import { findOrCreateChannelContact } from "../InboundServices/HandleChannelMessage";

// Finds (or creates) the contact to message by phone number on a connection.
// Only phone based channels can start a conversation from just a number.
export const resolveOutboundContact = async (whatsapp: Whatsapp, number: string, name: string) => {
  if (whatsapp.channel === "whatsapp") {
    const digits = number.replace(/\D/g, "");
    const valid = await whatsappProvider.checkNumber(whatsapp.id, digits);
    const finalNumber = (valid || digits).replace(/\D/g, "");
    let contact = await Contact.findOne({ where: { number: finalNumber } });
    if (!contact) {
      contact = await Contact.create({
        name: name || finalNumber,
        number: finalNumber,
        isGroup: false,
        channel: "whatsapp"
      });
      getIO().emit("contact", { action: "create", contact });
    }
    return contact;
  }
  if (whatsapp.channel === "whatsapp_cloud") {
    const digits = number.replace(/\D/g, "");
    return findOrCreateChannelContact(whatsapp, digits, name || digits);
  }
  // other channels cannot start a conversation from a phone number
  throw new Error("channel does not support outbound campaigns");
};

