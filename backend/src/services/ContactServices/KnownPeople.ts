import { Op } from "sequelize";
import Contact from "../../models/Contact";

export interface PersonRef { key: string; isLid?: boolean; phone?: string; name?: string }

// The people of a group (or who read a message) next to who the system already knows: the name saved here first, then the name the
// phone has, then the phone. An internal id of WhatsApp (LID) is never shown as a phone number.
export const withKnownContacts = async <T extends PersonRef>(people: T[]) => {
  const numbers = [...new Set(people.map(p => p.phone || (!p.isLid ? p.key : "")).filter(Boolean))];
  const lids = [...new Set(people.filter(p => p.isLid).map(p => p.key))];
  const known = numbers.length || lids.length
    ? await Contact.findAll({
        where: { [Op.or]: [{ number: { [Op.in]: numbers.length ? numbers : ["-"] } }, { lid: { [Op.in]: lids.length ? lids : ["-"] } }] } as any,
        attributes: ["id", "name", "number", "lid", "isStaff", "isPersonal", "profilePicUrl"]
      })
    : [];
  const byNumber = new Map<string, Contact>();
  const byLid = new Map<string, Contact>();
  known.forEach(c => {
    if (c.number) byNumber.set(c.number, c);
    if (c.lid) byLid.set(String(c.lid).split("@")[0], c);
  });
  const placeholder = (n?: string | null) => !n || /^\+?[\d\s().-]{8,}$/.test(n) || n === "Contato sem telefone" || n === "Participante";
  return people.map(p => {
    const phone = p.phone || (!p.isLid && /^\d{8,15}$/.test(p.key) ? p.key : "");
    const c = (phone && byNumber.get(phone)) || (p.isLid ? byLid.get(p.key) : undefined) || null;
    const name = c && !placeholder(c.name) ? c.name : p.name || null;
    return {
      ...p,
      contactId: c ? c.id : null,
      name,
      number: phone || (c && c.number) || null,
      isStaff: c ? c.isStaff : false,
      isPersonal: c ? c.isPersonal : false,
      profilePicUrl: c ? c.profilePicUrl : null
    };
  });
};
