import GetDefaultWhatsApp from "../../helpers/GetDefaultWhatsApp";
import Whatsapp from "../../models/Whatsapp";
import SaveImportedContacts from "../../helpers/SaveImportedContacts";
import { whatsappProvider } from "../../providers/WhatsApp";
import AppError from "../../errors/AppError";
import { logger } from "../../utils/logger";

// Imports the saved contacts of the user's own connected number (or the default one).
const ImportContactsService = async (userId: number): Promise<number> => {
  // the user's own connected number first, then the one linked to them / the company default
  const own = await Whatsapp.findOne({
    where: { ownerId: userId, status: "CONNECTED" }
  });
  const defaultWhatsapp = own || (await GetDefaultWhatsApp(userId));

  let phoneContacts;
  try {
    phoneContacts = await whatsappProvider.getContacts(defaultWhatsapp.id);
  } catch (err) {
    logger.error(`Could not get whatsapp contacts from phone. Err: ${err}`);
    throw new AppError("ERR_WAPP_NOT_INITIALIZED");
  }

  return SaveImportedContacts(phoneContacts);
};

export default ImportContactsService;
