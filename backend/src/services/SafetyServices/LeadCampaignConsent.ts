import { Op } from "sequelize";
import Contact from "../../models/Contact";
import { brPhoneVariants } from "../../helpers/PhoneVariants";

export interface ConsentedLeadForCampaign {
  name: string;
  phone: string;
  consentAt: Date | null;
}

// A CRM lead can enter a campaign list without ever having created a Contact row.
// Persist only recorded opt-in evidence; an existing opt-out remains authoritative.
export const recordLeadCampaignConsent = async (lead: ConsentedLeadForCampaign): Promise<void> => {
  if (!lead.consentAt || !lead.phone) return;
  const variants = brPhoneVariants(lead.phone);
  if (!variants.length) return;
  const contact = await Contact.findOne({ where: { number: { [Op.in]: variants } } as any, order: [["id", "ASC"]] });
  if (contact) {
    if (!contact.optOut && !contact.consentAt) await contact.update({ consentAt: lead.consentAt, consentSource: "form" } as any);
    return;
  }
  await Contact.create({ name: lead.name, number: lead.phone, email: "", channel: "whatsapp", optOut: false, consentAt: lead.consentAt, consentSource: "form" } as any);
};
