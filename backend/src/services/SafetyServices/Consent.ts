import { Op } from "sequelize";

import Contact from "../../models/Contact";
import { brPhoneVariants } from "../../helpers/PhoneVariants";

export type ConsentSource = "form" | "inbound" | "import" | "manual";

// records the consent of a contact the first time it happens (the first source is kept)
export const noteConsent = async (contactId: number, source: ConsentSource): Promise<void> => {
  await Contact.update({ consentAt: new Date(), consentSource: source } as any, { where: { id: contactId, consentAt: null } as any });
};

// the same by phone (a form fills a lead whose contact may already exist)
export const noteConsentByPhone = async (phone: string | null | undefined, source: ConsentSource): Promise<void> => {
  const variants = brPhoneVariants(String(phone || ""));
  if (!variants.length || !variants[0]) return;
  await Contact.update({ consentAt: new Date(), consentSource: source } as any, { where: { number: { [Op.in]: variants }, consentAt: null } as any });
};
