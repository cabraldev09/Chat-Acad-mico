import { Op } from "sequelize";

import Campaign from "../../models/Campaign";
import CampaignShipping from "../../models/CampaignShipping";
import Contact from "../../models/Contact";
import Course from "../../models/Course";
import Lead from "../../models/Lead";
import LeadCommercial from "../../models/LeadCommercial";
import Ticket from "../../models/Ticket";
import User from "../../models/User";
import { brPhoneVariants } from "../../helpers/PhoneVariants";
import { todayInAppTz } from "../../helpers/AppTime";
import { logger } from "../../utils/logger";
import { Approach, offerFor, offerValid } from "./Offer";

// WHEN A PERSON ANSWERS A RECOVERY CAMPAIGN (up to 7 days after it went out, while the offer holds), the approach the management chose:
//  - "ia": the AI of the official number talks with the offer (it may say only its values) and passes to the consultant to close;
//  - "proposta": the proposal is made with the offer, in the name of the consultant, and sent; the consultant follows it;
//  - "consultor": the conversation goes to the consultant, with a task.
// Once per campaign and person (the next messages follow the conversation as usual).
const REPLY_DAYS = 7;

export const recoveryShippingOf = async (number: string | null | undefined): Promise<{ campaign: Campaign; shipping: CampaignShipping } | null> => {
  if (!number) return null;
  const shipping = await CampaignShipping.findOne({
    where: { number: { [Op.in]: brPhoneVariants(number) }, sentAt: { [Op.gt]: new Date(Date.now() - REPLY_DAYS * 864e5) } } as any,
    include: [{ model: Campaign, required: true, where: { offer: { [Op.ne]: null }, approach: { [Op.ne]: null } } as any }],
    order: [["sentAt", "DESC"]]
  });
  return shipping && shipping.campaign ? { campaign: shipping.campaign, shipping } : null;
};

const slotsOf = (c: LeadCommercial): Record<string, any> => { try { return JSON.parse(c.slots || "{}") || {}; } catch { return {}; } };

// the proposal of the offer, made and sent in the name of the consultant (the same path as the consultant's own proposal)
export const sendOfferProposal = async (leadId: number, ownerId: number, campaign: Campaign): Promise<boolean> => {
  const ProposalController = await import("../../controllers/ProposalController");
  const owner = await User.findByPk(ownerId, { attributes: ["id", "name", "profile", "role"] });
  const lead = await Lead.findByPk(leadId);
  if (!owner || !lead || !lead.courseId) return false;
  const course = await Course.findByPk(lead.courseId, { attributes: ["monthlyFee"] });
  const v = offerFor(JSON.parse(campaign.offer), course ? Number((course as any).monthlyFee) || null : null);
  if (!v.monthly) return false;
  const user: any = { id: owner.id, profile: owner.profile, role: (owner as any).role };
  const call = async (fn: any, req: any): Promise<any> => {
    let out: any = null;
    const res: any = { status: () => res, json: (b: any) => { out = b; return res; }, send: (b: any) => { out = b; return res; } };
    await fn({ ...req, user, query: {}, headers: {} }, res);
    return out;
  };
  const params: any = { monthly: v.monthly, firstMonthly: v.monthly, enrollmentFee: v.fee, enrollmentExempt: v.exempt, ...(v.start ? { firstDueDate: v.start } : {}) };
  const made = await call(ProposalController.store, { body: { leadId, courseId: lead.courseId, params }, params: {} });
  const id = made && made.id;
  if (!id) return false;
  const Proposal = (await import("../../models/Proposal")).default;
  await Proposal.update({ validUntil: v.until } as any, { where: { id } });
  // a proposal that misses something only the consultant knows (the form of admission, the due date) stays as a draft for them
  try {
    await call(ProposalController.send, { body: {}, params: { id: String(id) } });
  } catch (err) {
    logger.warn(`Recuperação: a proposta #${id} ficou em rascunho: ${(err as Error).message}`);
    return false;
  }
  return true;
};

// returns the approach applied (the caller skips the usual return to the consultant when it is "ia"), or null
// the same lead answering twice at once (two quick messages) makes one proposal and one offer, never two
const handling = new Set<string>();

// a person who asked to stop receiving messages ("SAIR", "PARAR"), now or before, gets nothing of the campaign
const stopped = async (contactId: number): Promise<boolean> => {
  const fresh = await Contact.findByPk(contactId, { attributes: ["id", "optOut"] });
  return !fresh || !!(fresh as any).optOut;
};

export const onRecoveryReply = async (ticket: Ticket, contact: Contact, body?: string): Promise<Approach | null> => {
  if (ticket.isGroup || contact.isGroup) return null;
  if ((contact as any).optOut) return null;
  const { optKeyword } = await import("../SafetyServices/SendGuard");
  const saysStop = !!body && optKeyword(body) === "out";
  const found = await recoveryShippingOf(contact.number);
  if (!found) return null;
  const { campaign } = found;
  // the lead of this person: by the conversation's contact, else by the phone (a lead that came from a list may not have the contact yet)
  const lead = (await Lead.findOne({ where: { contactId: contact.id }, order: [["updatedAt", "DESC"]] }))
    || (contact.number ? await Lead.findOne({ where: { phone: { [Op.in]: brPhoneVariants(contact.number) } } as any, order: [["updatedAt", "DESC"]] }) : null);
  if (!lead || lead.enrolledAt) return null;
  if (saysStop) {
    // the answer to the campaign was "SAIR": out of Recuperação, nothing is sent (the opt-out itself is handled as always)
    if (lead.recoveryState === "aberta" || lead.recoveryState === "voltou") {
      await lead.update({ recoveryState: "descartada" } as any);
      const { addActivity } = await import("../CrmServices/LeadCore");
      await addActivity(lead.id, null, "system", `Pediu para não receber mais mensagens ao responder a campanha de recuperação "${campaign.name}": saiu da Recuperação.`);
    }
    return null;
  }
  const lockKey = `${campaign.id}-${lead.id}`;
  if (handling.has(lockKey)) return null;
  handling.add(lockKey);
  setTimeout(() => handling.delete(lockKey), 60000).unref?.();
  let offer: any;
  try { offer = JSON.parse(campaign.offer); } catch { return null; }
  if (!offerValid(offer.validUntil, todayInAppTz())) return null;
  const [commercial] = await LeadCommercial.findOrCreate({ where: { leadId: lead.id }, defaults: { leadId: lead.id } as any });
  const slots = slotsOf(commercial);
  if (Number(slots.recoveryCampaignId) === campaign.id) return null;
  const course = lead.courseId ? await Course.findByPk(lead.courseId, { attributes: ["monthlyFee"] }) : null;
  const values = offerFor(offer, course ? Number((course as any).monthlyFee) || null : null);
  const { addActivity } = await import("../CrmServices/LeadCore");
  const { ensureTask } = await import("../CrmServices/Tasks");
  let approach = campaign.approach as Approach;
  // the AI answers only where an agent answers this conversation; otherwise the consultant takes it
  if (approach === "ia") {
    const { findAgentForTicket } = await import("../AiServices/RunAiAgent");
    if (!(await findAgentForTicket(ticket).catch(() => null))) approach = "consultor";
  }
  if (approach === "proposta" && (!lead.ownerId || !lead.courseId || !values.monthly)) approach = "consultor";
  await commercial.update({ slots: JSON.stringify({ ...slots, recoveryCampaignId: campaign.id, ...(approach === "ia" ? { recoveryOffer: { ...values, campaignId: campaign.id } } : {}) }) });
  await lead.update({ recoveryState: "voltou", lastInboundAt: new Date() } as any);
  await addActivity(lead.id, null, "system", `Respondeu à campanha de recuperação "${campaign.name}" (${approach === "ia" ? "a IA conversa com a oferta e passa ao consultor" : approach === "proposta" ? "a proposta com a oferta é enviada" : "o consultor retoma"}).`);
  const owner = Number(lead.ownerId) || null;
  if (owner && approach !== "ia") {
    await ensureTask({ key: `recovery-reply-${campaign.id}-${lead.id}`, leadId: lead.id, userId: owner, title: approach === "proposta" ? "Proposta de recuperação enviada: acompanhe a resposta" : "Respondeu à campanha de recuperação: retome a conversa", dueAt: new Date(Date.now() + 2 * 3600000), type: "whatsapp" });
  }
  // the consultant takes it: the offer goes now, in the window the reply opened (the Utility template carried no value), then the consultant
  if (approach === "consultor" && (values.monthly || values.exempt || values.fee)) {
    const ticketId = ticket.id;
    setTimeout(async () => {
      try {
        if (await stopped(contact.id)) return;
        const { offerIntro } = await import("./Offer");
        const fresh = await Ticket.findByPk(ticketId, { include: ["contact", "whatsapp"] as any });
        if (!fresh || !(fresh as any).contact || !(fresh as any).whatsapp) return;
        const SendToContact = (await import("../ChannelServices/SendToContact")).default;
        await SendToContact({ contact: (fresh as any).contact, whatsapp: (fresh as any).whatsapp, body: offerIntro(values).replace(/ Quer que eu chame o consultor para fazer a sua matrícula\?$/, " O seu consultor já vai falar com você."), keepOpen: owner ? { userId: owner } : undefined } as any);
      } catch (err) {
        logger.warn(`Recuperação: a oferta para o lead ${lead.id} não saiu: ${err}`);
      }
    }, Number(process.env.RECOVERY_PROPOSAL_DELAY_MS || 3000)).unref?.();
  }
  if (approach === "proposta" && owner) {
    // after the person's message is stored, so the proposal comes after it in the conversation
    setTimeout(async () => {
      if (await stopped(contact.id).catch(() => true)) return;
      const failed = async () => {
        await addActivity(lead.id, null, "system", "A proposta da campanha de recuperação não saiu sozinha (falta a forma de ingresso ou o vencimento): ficou em rascunho para o consultor.").catch(() => undefined);
        await ensureTask({ key: `recovery-proposal-${campaign.id}-${lead.id}`, leadId: lead.id, userId: owner, title: "Envie a proposta da campanha de recuperação (ficou em rascunho)", dueAt: new Date(Date.now() + 3600000), type: "proposta" }).catch(() => undefined);
      };
      sendOfferProposal(lead.id, owner, campaign).then(ok => (ok ? undefined : failed())).catch(err => { logger.warn(`Recuperação: proposta do lead ${lead.id}: ${err}`); return failed(); });
    }, Number(process.env.RECOVERY_PROPOSAL_DELAY_MS || 3000)).unref?.();
  }
  return approach;
};
