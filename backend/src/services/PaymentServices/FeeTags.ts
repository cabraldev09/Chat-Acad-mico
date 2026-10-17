import { Op, QueryTypes } from "sequelize";

import sequelize from "../../database";
import { getIO } from "../../libs/socket";
import ContactTag from "../../models/ContactTag";
import Lead from "../../models/Lead";
import LeadTag from "../../models/LeadTag";
import Payment from "../../models/Payment";
import Tag from "../../models/Tag";
import Ticket from "../../models/Ticket";
import TicketTag from "../../models/TicketTag";
import { logger } from "../../utils/logger";

// The label of the enrollment fee: a student who is enrolled but whose fee is not paid yet carries "Taxa pendente"; the
// moment the payment is confirmed the label becomes "Taxa paga". It goes on the lead (funnel card), on the person's contact
// and on their conversations (the list), so the consultant and the tutor see it wherever they look.
export const FEE_PENDING_TAG = { name: "Taxa pendente", color: "#E5484D" };
export const FEE_PAID_TAG = { name: "Taxa paga", color: "#16A34A" };

const ensure = async (def: { name: string; color: string }): Promise<Tag> => {
  const [tag] = await Tag.findOrCreate({ where: { name: def.name }, defaults: { name: def.name, color: def.color } as any });
  return tag;
};

const hasTag = async (leadId: number, tagId: number): Promise<boolean> => !!(await LeadTag.findOne({ where: { leadId, tagId } }));

const hasPaidFee = async (leadId: number): Promise<boolean> =>
  !!(await Payment.findOne({ where: { leadId, kind: "matricula", status: "paid" }, attributes: ["id"] }));

// puts `add` and takes `remove` off the lead, the contact and the conversations of that person, and tells the screens
const swap = async (lead: Lead, add: Tag, remove: Tag): Promise<void> => {
  await LeadTag.findOrCreate({ where: { leadId: lead.id, tagId: add.id }, defaults: { leadId: lead.id, tagId: add.id } as any });
  await LeadTag.destroy({ where: { leadId: lead.id, tagId: remove.id } });
  if (!lead.contactId) return;
  await ContactTag.findOrCreate({ where: { contactId: lead.contactId, tagId: add.id }, defaults: { contactId: lead.contactId, tagId: add.id } as any });
  await ContactTag.destroy({ where: { contactId: lead.contactId, tagId: remove.id } });
  const tickets = await Ticket.findAll({ where: { contactId: lead.contactId, status: { [Op.in]: ["open", "pending"] } } });
  for (const t of tickets) {
    // eslint-disable-next-line no-await-in-loop
    await TicketTag.findOrCreate({ where: { ticketId: t.id, tagId: add.id }, defaults: { ticketId: t.id, tagId: add.id } as any });
    // eslint-disable-next-line no-await-in-loop
    await TicketTag.destroy({ where: { ticketId: t.id, tagId: remove.id } });
    // eslint-disable-next-line no-await-in-loop
    const tags = await (t as any).$get("tags", { attributes: ["id", "name", "color"], joinTableAttributes: [] });
    getIO().to(t.status).to(String(t.id)).emit("ticket", { action: "tags", ticketId: t.id, tags });
  }
};

const emitLead = async (leadId: number): Promise<void> => {
  const { loadLead } = await import("../CrmServices/LeadCore");
  getIO().emit("lead", { action: "update", lead: await loadLead(leadId) });
};

// enrolled and the fee is not paid: "Taxa pendente" (never over a fee that is already paid)
export const markFeePending = async (lead: Lead): Promise<void> => {
  try {
    const [pending, paid] = await Promise.all([ensure(FEE_PENDING_TAG), ensure(FEE_PAID_TAG)]);
    if ((await hasPaidFee(lead.id)) || (await hasTag(lead.id, paid.id))) return markFeePaid(lead);
    if (await hasTag(lead.id, pending.id)) return undefined;
    await swap(lead, pending, paid);
    await emitLead(lead.id);
  } catch (err) {
    logger.warn(`fee label (pending) not applied to lead ${lead.id}: ${(err as Error).message}`);
  }
  return undefined;
};

// the fee was paid (by the confirmed payment, or declared paid when the enrollment was confirmed): "Taxa paga", at once
export const markFeePaid = async (lead: Lead): Promise<void> => {
  try {
    const [pending, paid] = await Promise.all([ensure(FEE_PENDING_TAG), ensure(FEE_PAID_TAG)]);
    if ((await hasTag(lead.id, paid.id)) && !(await hasTag(lead.id, pending.id))) return;
    await swap(lead, paid, pending);
    await emitLead(lead.id);
  } catch (err) {
    logger.warn(`fee label (paid) not applied to lead ${lead.id}: ${(err as Error).message}`);
  }
};

// Students enrolled before this label existed, whose charge is still open: they get "Taxa pendente" too. Only the ones with an
// open charge: for the others the system never recorded whether the fee was paid, and it does not guess.
export const syncPendingFeeTags = async (): Promise<void> => {
  try {
    const rows: Array<{ id: number }> = await sequelize.query(
      `SELECT DISTINCT l.id FROM "Leads" l
         JOIN "Payments" p ON p."leadId" = l.id AND p.kind = 'matricula' AND p.status IN ('pending', 'scheduled')
        WHERE l."enrolledAt" IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM "LeadTags" lt JOIN "Tags" t ON t.id = lt."tagId" WHERE lt."leadId" = l.id AND t.name IN (:names))
        LIMIT 100`,
      { replacements: { names: [FEE_PENDING_TAG.name, FEE_PAID_TAG.name] }, type: QueryTypes.SELECT }
    );
    for (const r of rows) {
      // eslint-disable-next-line no-await-in-loop
      const lead = await Lead.findByPk(r.id);
      // eslint-disable-next-line no-await-in-loop
      if (lead) await markFeePending(lead);
    }
  } catch (err) {
    logger.warn(`fee labels sync failed: ${(err as Error).message}`);
  }
};
