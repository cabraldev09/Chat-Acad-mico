import { QueryTypes } from "sequelize";
import sequelize from "../../database";
import Contact from "../../models/Contact";
import User from "../../models/User";
import Whatsapp from "../../models/Whatsapp";
import SaveImportedContacts from "../../helpers/SaveImportedContacts";
import { agendaModeOf, isPlaceholderName, KnownContact, namesToComplete } from "../../helpers/PhoneNames";
import { roleOf } from "../../helpers/Roles";
import { whatsappProvider } from "../../providers/WhatsApp";
import { getIO } from "../../libs/socket";
import { logger } from "../../utils/logger";

// The people who talk to this number (a conversation on it) and are still only a number in the system get the name the phone has for
// them: the address book's, else the profile name. A name somebody typed in the system is never replaced.
export const completeNamesFromPhone = async (whatsapp: Whatsapp): Promise<number> => {
  if (!whatsappProvider.getPhoneNames) return 0;
  const known = (await sequelize.query(
    `SELECT c.id, c.name, c.number, c.lid FROM "Contacts" c
      WHERE c."isGroup" = false AND EXISTS (SELECT 1 FROM "Tickets" t WHERE t."contactId" = c.id AND t."whatsappId" = :wid)`,
    { replacements: { wid: whatsapp.id }, type: QueryTypes.SELECT }
  )) as KnownContact[];
  const waiting = known.filter(isPlaceholderName);
  if (!waiting.length) return 0;
  const phone = await whatsappProvider.getPhoneNames(whatsapp.id);
  const patches = namesToComplete(waiting, phone);
  if (!patches.length) return 0;
  const contacts = await Contact.findAll({ where: { id: patches.map(p => p.id) } });
  const nameOf = new Map(patches.map(p => [p.id, p.name]));
  let done = 0;
  for (const contact of contacts) {
    const name = nameOf.get(contact.id);
    // read again right before writing: somebody may have typed a name meanwhile
    if (!name || !isPlaceholderName(contact)) continue;
    contact.set({ name });
    // eslint-disable-next-line no-await-in-loop
    await contact.update({ name }).catch(() => undefined);
    getIO().emit("contact", { action: "update", contact });
    done += 1;
  }
  return done;
};

// What a QR Code number does with its phone when it connects and every few hours: the company's numbers and the administrators' bring
// the address book as contacts (new people and real names for the ones that were a number); every number names the people who talk to
// it (agendaModeOf: the address book of a consultant or a tutor is personal, nobody new comes from it).
export const syncPhoneContacts = async (whatsapp: Whatsapp): Promise<{ created: number; updated: number; named: number }> => {
  let role: string | null = null;
  if (whatsapp.ownerId) {
    const owner = await User.findByPk(whatsapp.ownerId, { attributes: ["profile", "role"] });
    role = owner ? roleOf(owner) : "consultor";
  }
  let created = 0;
  let updated = 0;
  if (agendaModeOf(role) === "import") {
    const saved = await SaveImportedContacts(await whatsappProvider.getContacts(whatsapp.id));
    created = saved.created;
    updated = saved.updated;
  }
  const named = await completeNamesFromPhone(whatsapp);
  if (created || updated || named) logger.info(`Session ${whatsapp.name}: ${created} contacts from the phone, ${updated} completed, ${named} named from the conversations`);
  return { created, updated, named };
};
