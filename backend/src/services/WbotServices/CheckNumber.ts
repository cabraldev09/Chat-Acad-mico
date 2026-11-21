import { qrChecker } from "../../helpers/QrChecker";
import { normalizePhone } from "../../helpers/Phone";
import { whatsappProvider } from "../../providers/WhatsApp";

// the number as WhatsApp knows it (a QR session answers); with only the official API, the number normalized (55 + area code + number)
const CheckContactNumber = async (number: string): Promise<string> => {
  const checker = await qrChecker();
  if (!checker) return normalizePhone(number) || String(number).replace(/\D/g, "");
  return whatsappProvider.checkNumber(checker.id, number);
};

export default CheckContactNumber;
