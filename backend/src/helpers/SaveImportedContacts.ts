import { Op } from "sequelize";
import Contact from "../models/Contact";

export interface Imported {
  number?: string;
  name?: string;
  lid?: string;
  isGroup?: boolean;
}

export interface SaveResult {
  created: number;
  updated: number;
}

// A name that is just the number (or empty) is a placeholder; a real name replaces it.
const isPlaceholder = (c: Contact): boolean => !c.name || c.name === c.number || c.name === c.lid || /^\d{8,}$/.test(c.name);

// Adds the people and groups of the phone that the system does not know yet and completes the ones it does
// (a real name instead of the number, the phone behind an internal id). Never removes or overwrites a name
// someone typed in the system.
const SaveImportedContacts = async (list: Imported[]): Promise<SaveResult> => {
  const items = new Map<string, Imported>();
  list.forEach(item => {
    const key = String(item.isGroup ? item.number : item.number || item.lid || "").replace(/[^0-9a-zA-Z-]/g, "");
    if (key && !items.has(key)) items.set(key, { ...item, number: item.number ? String(item.number).replace(item.isGroup ? /[^0-9-]/g : /\D/g, "") : undefined });
  });

  const all = Array.from(items.values());
  let created = 0;
  let updated = 0;

  for (let i = 0; i < all.length; i += 400) {
    const slice = all.slice(i, i + 400);
    const numbers = slice.map(x => x.number).filter(Boolean) as string[];
    const lids = slice.map(x => x.lid).filter(Boolean) as string[];

    // eslint-disable-next-line no-await-in-loop
    const existing = await Contact.findAll({
      where: { [Op.or]: [{ number: { [Op.in]: [...numbers, ...lids] } }, { lid: { [Op.in]: lids.length ? lids : ["-"] } }] }
    });
    const byNumber = new Map(existing.filter(c => c.number).map(c => [c.number, c]));
    const byLid = new Map(existing.filter(c => c.lid).map(c => [c.lid, c]));

    const fresh: Array<Record<string, unknown>> = [];
    for (const item of slice) {
      const found =
        (item.number && byNumber.get(item.number)) ||
        (item.lid && byLid.get(item.lid)) ||
        // an older bug stored the internal id in the number column
        (item.lid && byNumber.get(item.lid)) ||
        undefined;

      if (found) {
        const patch: Record<string, unknown> = {};
        if (item.name && isPlaceholder(found) && item.name !== found.name) patch.name = item.name;
        if (item.number && found.number !== item.number && (!found.number || found.number === item.lid)) patch.number = item.number;
        if (item.lid && !found.lid) patch.lid = item.lid;
        if (Object.keys(patch).length) {
          // eslint-disable-next-line no-await-in-loop
          await found.update(patch).catch(() => undefined);
          updated += 1;
        }
      } else {
        fresh.push({
          number: item.number || null,
          lid: item.lid || null,
          name: item.name || item.number || "Contato",
          isGroup: !!item.isGroup
        });
      }
    }
    if (fresh.length) {
      // eslint-disable-next-line no-await-in-loop
      await Contact.bulkCreate(fresh as any, { ignoreDuplicates: true });
      created += fresh.length;
    }
  }

  return { created, updated };
};

export default SaveImportedContacts;
