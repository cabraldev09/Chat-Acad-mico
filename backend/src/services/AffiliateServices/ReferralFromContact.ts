import { normalizePhone } from "../../helpers/Phone";
import { logger } from "../../utils/logger";
import LeadTask from "../../models/LeadTask";
import { addActivity, upsertLead } from "../CrmServices/LeadCore";
import { findAffiliateByPhone } from "./AffiliateLane";

export interface VcardPerson {
  name: string;
  number: string;
}

// One message can carry several shared contacts; each card has a FN (name) and one or more TEL lines.
export const parseVcards = (body: string): VcardPerson[] => {
  const people: VcardPerson[] = [];
  String(body || "")
    .split(/BEGIN:VCARD/i)
    .slice(1)
    .forEach(card => {
      const name = (card.match(/^FN[^:\n]*:(.+)$/im)?.[1] || "").trim();
      const seen = new Set<string>();
      const tels = card.match(/^.*TEL[^\n]*$/gim) || [];
      tels.forEach(line => {
        const waid = line.match(/waid=(\d{8,15})/i)?.[1];
        const value = line.slice(line.indexOf(":") + 1).replace(/\D/g, "");
        const number = waid || value;
        if (number.length >= 8 && !seen.has(number)) {
          seen.add(number);
          people.push({ name, number });
        }
      });
    });
  return people;
};

// When the sender of a shared contact is an affiliate, each person in the card becomes a lead in the affiliate column,
// tagged "Afiliado", owned by the affiliate's consultant, with a task to make the first contact.
// Returns how many leads were created (0 when the sender is not an affiliate).
export const registerAffiliateReferrals = async (senderNumber: string, people: VcardPerson[]): Promise<number> => {
  if (!people.length) return 0;
  const affiliate = await findAffiliateByPhone(senderNumber);
  if (!affiliate) return 0;
  let created = 0;
  for (const person of people) {
    const phone = normalizePhone(person.number);
    // the affiliate sharing their own card does not count as a referral
    if (!phone || phone === normalizePhone(affiliate.phone)) continue;
    try {
      // eslint-disable-next-line no-await-in-loop
      const out = await upsertLead(
        {
          name: person.name || phone,
          phone,
          source: "Indicação",
          channel: "affiliate",
          notes: `Contato enviado pelo afiliado ${affiliate.name} no WhatsApp`,
          ownerId: affiliate.ownerId,
          affiliateId: affiliate.id
        },
        null
      );
      if (out.created) {
        created += 1;
        // eslint-disable-next-line no-await-in-loop
        await addActivity(out.lead.id, null, "system", `Indicado por ${affiliate.name} (contato enviado no WhatsApp)`);
        if (affiliate.ownerId) {
          // eslint-disable-next-line no-await-in-loop
          await LeadTask.create({
            leadId: out.lead.id,
            userId: affiliate.ownerId,
            type: "whatsapp",
            title: `Fazer o 1º contato com ${person.name || phone} (indicado por ${affiliate.name})`,
            dueAt: new Date(Date.now() + 3600000)
          } as any);
        }
      }
    } catch (err) {
      logger.error(`Affiliate referral from shared contact failed: ${err}`);
    }
  }
  return created;
};
