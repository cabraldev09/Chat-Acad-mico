import { brPhoneVariants } from "../../helpers/PhoneVariants";
import { Op } from "sequelize";

import { getSetting, setSetting } from "../../helpers/AppSettings";
import { normalizePhone } from "../../helpers/Phone";
import Affiliate from "../../models/Affiliate";
import ContactTag from "../../models/ContactTag";
import Lead from "../../models/Lead";
import LeadStage from "../../models/LeadStage";
import LeadTag from "../../models/LeadTag";
import Tag from "../../models/Tag";

export const AFFILIATE_STAGE_NAME = "Indicações de afiliados";
export const AFFILIATE_TAG_NAME = "Afiliado";

// First column of the funnel: people an affiliate referred wait here until the consultant makes the first contact.
// Created on first use (and remembered), so existing installations get it without a migration.
export const ensureAffiliateStage = async (): Promise<LeadStage> => {
  const stored = Number(await getSetting("affiliate_stage_id", "0")) || 0;
  if (stored) {
    const found = await LeadStage.findByPk(stored);
    if (found) return found;
  }
  let stage = await LeadStage.findOne({ where: { name: AFFILIATE_STAGE_NAME } });
  if (!stage) {
    const first = await LeadStage.min("position");
    stage = await LeadStage.create({
      name: AFFILIATE_STAGE_NAME,
      color: "#F5A524",
      type: "open",
      position: Math.min(0, Number(first) || 0) - 1
    } as any);
  }
  await setSetting("affiliate_stage_id", String(stage.id));
  return stage;
};

// id of the affiliate column, or 0 when it was never needed (does not create it). The column is also found by its name when
// the remembered id is missing: otherwise it would be taken for the first regular column of the funnel and ordinary leads
// would start inside it.
export const affiliateStageId = async (): Promise<number> => {
  const stored = Number(await getSetting("affiliate_stage_id", "0")) || 0;
  if (stored && (await LeadStage.findByPk(stored, { attributes: ["id"] }))) return stored;
  const byName = await LeadStage.findOne({ where: { name: AFFILIATE_STAGE_NAME }, attributes: ["id"] });
  if (!byName) return 0;
  await setSetting("affiliate_stage_id", String(byName.id));
  return byName.id;
};

export const ensureAffiliateTag = async (): Promise<Tag> => {
  const [tag] = await Tag.findOrCreate({ where: { name: AFFILIATE_TAG_NAME }, defaults: { name: AFFILIATE_TAG_NAME, color: "#F5A524" } as any });
  return tag;
};

// the "Afiliado" label goes on the lead and on the person's contact (so it shows in the conversation list too)
export const tagAffiliateLead = async (lead: Lead): Promise<void> => {
  const tag = await ensureAffiliateTag();
  await LeadTag.findOrCreate({ where: { leadId: lead.id, tagId: tag.id }, defaults: { leadId: lead.id, tagId: tag.id } as any });
  if (lead.contactId) {
    await ContactTag.findOrCreate({ where: { contactId: lead.contactId, tagId: tag.id }, defaults: { contactId: lead.contactId, tagId: tag.id } as any });
  }
};

// the affiliate who owns this phone number (who writes to the official number, or shares a contact), when there is one. The official API
// often sends a Brazilian mobile without the ninth digit, so both forms are compared. The list is kept for a minute (a few hundred).
let cache: { at: number; list: Affiliate[] } | null = null;
export const resetAffiliateCache = (): void => { cache = null; };
export const findAffiliateByPhone = async (raw: string): Promise<Affiliate | null> => {
  const phone = normalizePhone(raw);
  if (!phone) return null;
  const wanted = new Set(brPhoneVariants(phone));
  if (!cache || Date.now() - cache.at > 60000) {
    cache = { at: Date.now(), list: await Affiliate.findAll({ where: { status: "active", phone: { [Op.ne]: null as any } } }) };
  }
  return cache.list.find(a => brPhoneVariants(normalizePhone(a.phone) || "").some(v => wanted.has(v))) || null;
};
