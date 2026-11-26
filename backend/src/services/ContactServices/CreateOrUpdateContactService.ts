import { fire } from "../../helpers/Fire";
import { isLocalPic } from "../../helpers/PicUrl";
import { getIO } from "../../libs/socket";
import Contact from "../../models/Contact";
import Ticket from "../../models/Ticket";
import { logger } from "../../utils/logger";

interface ExtraInfo {
  name: string;
  value: string;
}

interface Request {
  name: string;
  number: string;
  lid?: string;
  isGroup: boolean;
  email?: string;
  profilePicUrl?: string;
  extraInfo?: ExtraInfo[];
  community?: CommunityInfo;
}

export interface CommunityInfo {
  kind: "community" | "group";
  role?: "parent" | "announcement" | "member";
  communityId?: string | null;
  parentGroupId?: string | null;
  readOnly?: boolean;
}

// a name that is only the number (or nothing) says nothing about the person
const onlyNumber = (n: string | null | undefined, number: string | null | undefined): boolean =>
  !n || String(n).replace(/\D/g, "") === String(number || "").replace(/\D/g, "") || /^\+?\d[\d\s()-]*$/.test(String(n).trim());
// the name WhatsApp gives (saved on the phone, else the profile name, or the group's subject) replaces only a name that is still the number
export const betterNameOf = (current: string | null | undefined, incoming: string | null | undefined, number: string | null | undefined): boolean =>
  !!incoming && !onlyNumber(incoming, number) && onlyNumber(current, number);

const emitContact = (action: "update" | "create", contact: Contact) => {
  const io = getIO();

  io.emit("contact", { action, contact });
};

const CreateOrUpdateContactService = async ({
  name,
  number: rawNumber,
  lid,
  profilePicUrl,
  isGroup,
  email = "",
  extraInfo = [],
  community
}: Request): Promise<Contact> => {
  const number = isGroup ? String(rawNumber || "") : String(rawNumber || "").replace(/[^0-9]/g, "");
  if (!number && !lid) throw new Error("Either number or lid must be provided");

  const [contactByNumber, contactByLid] = await Promise.all([
    number ? Contact.findOne({ where: { number } }) : null,
    lid ? Contact.findOne({ where: { lid } }) : null
  ]);

  const shouldMerge =
    contactByNumber && contactByLid && contactByNumber.id !== contactByLid.id;

  if (shouldMerge) {
    // the conversations of the old id come to the contact of the number; where that contact already has a conversation on the same
    // number, the two become one (one live conversation per person and per number)
    const { liveTicketOf, mergeTicketsInto } = await import("../TicketServices/LiveTicket");
    const moving = await Ticket.findAll({ where: { contactId: contactByLid.id } });
    for (const t of moving) {
      // eslint-disable-next-line no-await-in-loop
      const there = !t.isGroup && !t.isHistorical ? await liveTicketOf(contactByNumber.id, t.whatsappId) : null;
      // eslint-disable-next-line no-await-in-loop
      if (there) await mergeTicketsInto(there.id, [t.id]); else await t.update({ contactId: contactByNumber.id });
    }

    await contactByLid.destroy();

    await contactByNumber.update({
      lid: contactByLid.lid,
      ...(profilePicUrl && !isLocalPic(contactByNumber.getDataValue("profilePicUrl")) ? { profilePicUrl } : {})
    });

    logger.info({
      info: "Merged contacts by number and lid",
      primaryContactId: contactByNumber.id,
      mergedContactId: contactByLid.id
    });

    emitContact("update", contactByNumber);

    return contactByNumber;
  }

  // community info detected from WhatsApp; a person who marked the group by hand keeps their choice
  const communityFields = isGroup && community ? { kind: community.kind, parentGroupId: community.parentGroupId || null, communityRole: community.role || null, communityId: community.communityId || community.parentGroupId || null, readOnly: !!community.readOnly } : {};

  if (contactByNumber) {
    // a person still known only by the number gets the name WhatsApp gives (the one saved on the phone, else the profile name); a name
    // typed in the system is never replaced
    const betterName = betterNameOf(contactByNumber.name, name, contactByNumber.number) ? { name } : {};
    await contactByNumber.update({
      ...betterName,
      // the provider says this chat is a group: a contact saved before as a person is corrected
      ...(isGroup && !contactByNumber.isGroup ? { isGroup: true } : {}),
      ...(contactByNumber.kind === "community" && !community?.kind ? {} : communityFields),
      lid: lid || contactByNumber.lid,
      ...(profilePicUrl && !isLocalPic(contactByNumber.getDataValue("profilePicUrl")) ? { profilePicUrl } : {})
    });

    emitContact("update", contactByNumber);

    return contactByNumber;
  }

  if (contactByLid) {
    await contactByLid.update({
      number: number || contactByLid.number,
      ...(profilePicUrl && !isLocalPic(contactByLid.getDataValue("profilePicUrl")) ? { profilePicUrl } : {})
    });

    emitContact("update", contactByLid);
    return contactByLid;
  }

  let created: Contact;
  try {
    created = await Contact.create({
      name,
      // people known only by WhatsApp's internal id have no phone number yet
      number: number || (null as any),
      lid,
      profilePicUrl,
      email,
      isGroup,
      extraInfo: extraInfo as any,
      ...communityFields
    });
  } catch (err) {
    // two events of the same new person arrived together: the other one made the contact a moment ago, and this message must not be lost
    if ((err as any)?.name === "SequelizeUniqueConstraintError") {
      const already = (number ? await Contact.findOne({ where: { number } }) : null) || (lid ? await Contact.findOne({ where: { lid } }) : null);
      if (already) return already;
    }
    throw err;
  }

  emitContact("create", created);
  fire("contact.created", { contactId: created.id });
  return created;
};

export default CreateOrUpdateContactService;
