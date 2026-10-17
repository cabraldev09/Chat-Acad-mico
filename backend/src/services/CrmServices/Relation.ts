import Contact from "../../models/Contact";
import Lead from "../../models/Lead";
import Ticket from "../../models/Ticket";
import { getIO } from "../../libs/socket";

// Who a contact is for us: a customer (the default), a friend or family member, or someone of the team. A friend and the team
// are not candidates: their leads leave the funnel and every number (kept, never deleted), and no new lead is made for them.
export type Relation = "customer" | "friend" | "staff";
export const RELATIONS: Relation[] = ["customer", "friend", "staff"];

export const relationOf = (c: { isStaff?: boolean; isPersonal?: boolean }): Relation => (c.isStaff ? "staff" : c.isPersonal ? "friend" : "customer");

// `force`: back to customer even when there is no conversation yet (a lead that came from a form)
export const applyRelation = async (contact: Contact, relation: Relation, force = false): Promise<void> => {
  await contact.update({ isStaff: relation === "staff", isPersonal: relation === "friend" });
  if (relation !== "customer") {
    await Lead.update({ isHistorical: true } as any, { where: { contactId: contact.id } });
  } else if (force || (await Ticket.count({ where: { contactId: contact.id, isHistorical: false } }))) {
    await Lead.update({ isHistorical: false } as any, { where: { contactId: contact.id } });
  }
  getIO().emit("contact", { action: "update", contact });
  getIO().emit("lead", { action: "update" });
};
