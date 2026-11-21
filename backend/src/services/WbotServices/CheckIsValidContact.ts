import AppError from "../../errors/AppError";
import { qrChecker } from "../../helpers/QrChecker";
import { isWhatsappReady } from "../../helpers/Phone";
import { whatsappProvider } from "../../providers/WhatsApp";

// Does this number have WhatsApp? A connected WhatsApp by QR Code can ask; with only the official API, the number is checked by its
// format (country and area code), since the Cloud API cannot look a number up before writing to it.
const CheckIsValidContact = async (number: string): Promise<void> => {
  const checker = await qrChecker();
  if (!checker) {
    if (!isWhatsappReady(number)) throw new AppError("ERR_WAPP_INVALID_CONTACT");
    return;
  }
  try {
    const isValidNumber = await whatsappProvider.checkNumber(checker.id, number);
    if (!isValidNumber) {
      throw new AppError("invalidNumber");
    }
  } catch (err) {
    if (err.message === "invalidNumber") {
      throw new AppError("ERR_WAPP_INVALID_CONTACT");
    }
    throw new AppError("ERR_WAPP_CHECK_CONTACT");
  }
};

export default CheckIsValidContact;
