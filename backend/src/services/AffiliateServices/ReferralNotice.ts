import { Op } from "sequelize";

import Affiliate from "../../models/Affiliate";
import Lead from "../../models/Lead";
import User from "../../models/User";
import { logger } from "../../utils/logger";
import { frontBase, notify } from "../MailServices/Notify";
import { managerIdsOfPolos } from "../NotificationServices/Notify";
import { affiliateReferralMail } from "../MailServices/Templates";

// +55 (69) 99999-0000
const prettyPhone = (raw: string | null | undefined): string => {
  const d = String(raw || "").replace(/\D/g, "");
  const n = d.startsWith("55") && d.length >= 12 ? d.slice(2) : d;
  if (n.length === 11) return `+55 (${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`;
  if (n.length === 10) return `+55 (${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`;
  return d ? `+${d}` : "";
};

// Who is told when an affiliate refers someone: the consultant of that affiliate, the administration and only the coordination of
// the lead's polo (the e-mail carries the name, the number and the course: a lead of another polo, or with no polo, never reaches
// the coordination of a polo; see managerIdsOfPolos). It goes out in the background: the referral is already saved and an e-mail
// problem never undoes it.
export const notifyReferral = (affiliate: Affiliate, lead: Lead, created: boolean): void => {
  (async () => {
    // the polo as it is now in the database (it is decided when the lead is saved)
    const fresh = await Lead.findByPk(lead.id, { attributes: ["id", "poloId"] });
    const ids = await managerIdsOfPolos([fresh ? fresh.poloId : lead.poloId]);
    const managers = ids.length
      ? await User.findAll({ where: { id: { [Op.in]: ids }, email: { [Op.ne]: null } } as any, attributes: ["id", "name", "email"] })
      : [];
    const owner = affiliate.ownerId ? await User.findByPk(affiliate.ownerId, { attributes: ["id", "name", "email"] }) : null;
    const facts = {
      affiliate: affiliate.name,
      person: lead.name,
      phone: prettyPhone(lead.phone),
      course: lead.course?.name || null,
      consultant: lead.owner?.name || owner?.name || null,
      alreadyKnown: !created
    };
    const link = `${frontBase()}/crm?lead=${lead.id}`;
    const sent = new Set<string>();
    const to = (u: User | null, forConsultant: boolean) => {
      const email = String(u?.email || "").trim().toLowerCase();
      if (!u || !email || sent.has(email)) return;
      sent.add(email);
      notify(email, affiliateReferralMail(u.name, facts, link, forConsultant), "affiliate referral");
    };
    to(owner, true);
    managers.forEach(a => to(a, false));
  })().catch(err => logger.warn(`Referral notice failed: ${(err as Error).message}`));
};
