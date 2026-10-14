import { Op } from "sequelize";
import Contact from "../models/Contact";

interface Imported {
  number?: string;
  name?: string;
}

// Adds the phone's contacts that the system does not know yet (matched by number) and keeps the
// ones already registered untouched. Returns how many were created.
const SaveImportedContacts = async (list: Imported[]): Promise<number> => {
  const byNumber = new Map<string, string>();
  list.forEach(({ number, name }) => {
    const digits = String(number || "").replace(/\D/g, "");
    if (digits && !byNumber.has(digits)) byNumber.set(digits, name || digits);
  });

  const numbers = Array.from(byNumber.keys());
  let created = 0;

  for (let i = 0; i < numbers.length; i += 500) {
    const slice = numbers.slice(i, i + 500);
    // eslint-disable-next-line no-await-in-loop
    const existing = await Contact.findAll({
      where: { number: { [Op.in]: slice } },
      attributes: ["number"]
    });
    const known = new Set(existing.map(c => c.number));
    const fresh = slice
      .filter(n => !known.has(n))
      .map(number => ({ number, name: byNumber.get(number) as string }));
    if (fresh.length) {
      // eslint-disable-next-line no-await-in-loop
      await Contact.bulkCreate(fresh);
      created += fresh.length;
    }
  }

  return created;
};

export default SaveImportedContacts;
