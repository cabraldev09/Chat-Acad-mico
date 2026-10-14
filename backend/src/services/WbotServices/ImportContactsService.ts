import Whatsapp from "../../models/Whatsapp";
import User from "../../models/User";
import SaveImportedContacts from "../../helpers/SaveImportedContacts";
import { whatsappProvider } from "../../providers/WhatsApp";
import AppError from "../../errors/AppError";
import { logger } from "../../utils/logger";

// Which connected WhatsApp number to read the address book from: the user's own, then the one linked to them or
// the company default, and finally (administrators only) any connected number.
const pickConnection = async (userId: number, whatsappId?: number): Promise<Whatsapp> => {
  const user = await User.findByPk(userId, { attributes: ["id", "profile", "whatsappId"] });
  const isAdmin = user?.profile === "admin";
  const connected = await Whatsapp.findAll({
    where: { status: "CONNECTED", channel: "whatsapp" },
    order: [["id", "ASC"]]
  });

  if (whatsappId) {
    const chosen = connected.find(w => w.id === Number(whatsappId));
    if (!chosen || (!isAdmin && chosen.ownerId !== userId)) throw new AppError("ERR_NO_PERMISSION", 403);
    return chosen;
  }

  const found =
    connected.find(w => w.ownerId === userId) ||
    connected.find(w => w.id === user?.whatsappId) ||
    connected.find(w => w.isDefault) ||
    (isAdmin ? connected[0] : undefined);
  if (!found) throw new AppError("ERR_NO_CONNECTED_WHATSAPP", 400);
  return found;
};

// Imports the saved contacts of a connected number into the company's contact list.
const ImportContactsService = async (userId: number, whatsappId?: number): Promise<number> => {
  const connection = await pickConnection(userId, whatsappId);

  let phoneContacts;
  try {
    phoneContacts = await whatsappProvider.getContacts(connection.id);
  } catch (err) {
    logger.error(`Could not get whatsapp contacts from phone. Err: ${err}`);
    throw new AppError("ERR_WAPP_NOT_INITIALIZED");
  }

  return SaveImportedContacts(phoneContacts);
};

export default ImportContactsService;
