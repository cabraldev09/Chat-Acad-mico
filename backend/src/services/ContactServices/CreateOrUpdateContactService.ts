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
    await Ticket.update(
      { contactId: contactByNumber.id },
      { where: { contactId: contactByLid.id } }
    );

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
    await contactByNumber.update({
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

  const created = await Contact.create({
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

  emitContact("create", created);
  fire("contact.created", { contactId: created.id });
  return created;
};

export default CreateOrUpdateContactService;
