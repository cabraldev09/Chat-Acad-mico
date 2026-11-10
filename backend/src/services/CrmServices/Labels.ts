import { Op } from "sequelize";

import { getIO } from "../../libs/socket";
import ContactTag from "../../models/ContactTag";
import Lead from "../../models/Lead";
import LeadTag from "../../models/LeadTag";
import Tag from "../../models/Tag";
import Ticket from "../../models/Ticket";
import TicketTag from "../../models/TicketTag";
import { logger } from "../../utils/logger";

// An automatic label (Documentos pendentes, Risco de evasão...): on or off for a lead, on the person's contact and on their
// open conversations, so it shows in the funnel card and in the conversation list. Nothing happens when it is already so.
export interface LabelDef {
  name: string;
  color: string;
}

export const setLabel = async (lead: Lead, def: LabelDef, on: boolean): Promise<boolean> => {
  try {
    const [tag] = await Tag.findOrCreate({ where: { name: def.name }, defaults: { name: def.name, color: def.color } as any });
    const has = !!(await LeadTag.findOne({ where: { leadId: lead.id, tagId: tag.id } }));
    if (has === on) return false;
    if (on) {
      await LeadTag.findOrCreate({ where: { leadId: lead.id, tagId: tag.id }, defaults: { leadId: lead.id, tagId: tag.id } as any });
    } else {
      await LeadTag.destroy({ where: { leadId: lead.id, tagId: tag.id } });
    }
    if (lead.contactId) {
      if (on) await ContactTag.findOrCreate({ where: { contactId: lead.contactId, tagId: tag.id }, defaults: { contactId: lead.contactId, tagId: tag.id } as any });
      else await ContactTag.destroy({ where: { contactId: lead.contactId, tagId: tag.id } });
      const tickets = await Ticket.findAll({ where: { contactId: lead.contactId, status: { [Op.in]: ["open", "pending"] } } });
      for (const t of tickets) {
        if (on) {
          // eslint-disable-next-line no-await-in-loop
          await TicketTag.findOrCreate({ where: { ticketId: t.id, tagId: tag.id }, defaults: { ticketId: t.id, tagId: tag.id } as any });
        } else {
          // eslint-disable-next-line no-await-in-loop
          await TicketTag.destroy({ where: { ticketId: t.id, tagId: tag.id } });
        }
        // eslint-disable-next-line no-await-in-loop
        const tags = await (t as any).$get("tags", { attributes: ["id", "name", "color"], joinTableAttributes: [] });
        getIO().to(t.status).to(String(t.id)).emit("ticket", { action: "tags", ticketId: t.id, tags });
      }
    }
    const { loadLead } = await import("./LeadCore");
    getIO().emit("lead", { action: "update", lead: await loadLead(lead.id) });
    return true;
  } catch (err) {
    logger.warn(`label "${def.name}" not set on lead ${lead.id}: ${(err as Error).message}`);
    return false;
  }
};
