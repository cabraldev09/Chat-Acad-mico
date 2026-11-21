import { qrChecker } from "../../helpers/QrChecker";
import { whatsappProvider } from "../../providers/WhatsApp";

// the picture of a number, when a WhatsApp by QR Code is connected (the official API of the Meta gives no pictures)
const GetProfilePicUrl = async (number: string): Promise<string | undefined> => {
  const checker = await qrChecker();
  if (!checker) return undefined;
  try {
    return await whatsappProvider.getProfilePicUrl(checker.id, number);
  } catch (err) {
    return undefined;
  }
};

export default GetProfilePicUrl;
