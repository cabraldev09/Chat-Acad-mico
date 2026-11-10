import AppError from "../../errors/AppError";
import Contact from "../../models/Contact";
import ContactCustomField from "../../models/ContactCustomField";

interface ExtraInfo {
  id?: number;
  name: string;
  value: string;
}
interface ContactData {
  email?: string;
  number?: string;
  name?: string;
  extraInfo?: ExtraInfo[];
}

interface Request {
  contactData: ContactData;
  contactId: string;
}

const UpdateContactService = async ({
  contactData,
  contactId
}: Request): Promise<Contact> => {
  const { email, name, number, extraInfo } = contactData;

  const contact = await Contact.findOne({
    where: { id: contactId },
    attributes: ["id", "name", "number", "email", "profilePicUrl"],
    include: ["extraInfo"]
  });

  if (!contact) {
    throw new AppError("ERR_NO_CONTACT_FOUND", 404);
  }

  if (extraInfo) {
    await Promise.all(
      extraInfo.map(async info => {
        // the id sent by the client is honoured only for a field of THIS contact (otherwise it would overwrite the field of somebody else)
        const own = info.id ? await ContactCustomField.findOne({ where: { id: info.id, contactId: contact.id }, attributes: ["id"] }) : null;
        if (own) await ContactCustomField.update({ name: info.name, value: info.value }, { where: { id: own.id, contactId: contact.id } });
        else await ContactCustomField.create({ name: info.name, value: info.value, contactId: contact.id } as any);
      })
    );

    // the fields that were left out of the list are removed (only the ones of this contact)
    await Promise.all(
      contact.extraInfo.map(async oldInfo => {
        const stillExists = extraInfo.findIndex(info => info.id === oldInfo.id);

        if (stillExists === -1) {
          await ContactCustomField.destroy({ where: { id: oldInfo.id, contactId: contact.id } });
        }
      })
    );
  }

  await contact.update({
    name,
    number,
    email
  });

  await contact.reload({
    attributes: ["id", "name", "number", "email", "profilePicUrl"],
    include: ["extraInfo"]
  });

  return contact;
};

export default UpdateContactService;
