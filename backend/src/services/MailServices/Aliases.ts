import { isEmail } from "../../helpers/Email";
import User from "../../models/User";

// Every person of the team has an address on the receiving domain made from the name ("João da Silva" → joao.silva@mail.<domain>);
// what arrives there is forwarded to the e-mail the person has in the Chat. A name shared by two people has no owner (it goes to the management).
const PARTICLES = new Set(["da", "de", "do", "das", "dos", "e"]);

export const aliasOf = (name: string): string => {
  const words = String(name || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/).filter(w => w && !PARTICLES.has(w));
  if (!words.length) return "";
  return words.length === 1 ? words[0] : `${words[0]}.${words[words.length - 1]}`;
};

export interface AliasEntry { name: string; alias: string; email: string; shared: boolean }

export const aliasTable = (people: Array<{ name: string; email: string }>): AliasEntry[] => {
  const rows = people.map(p => ({ name: p.name, alias: aliasOf(p.name), email: String(p.email || "").trim().toLowerCase() }))
    .filter(r => r.alias && isEmail(r.email));
  const count = rows.reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.alias]: (acc[r.alias] || 0) + 1 }), {});
  return rows.map(r => ({ ...r, shared: count[r.alias] > 1 })).sort((a, b) => a.alias.localeCompare(b.alias));
};

export const loadAliasTable = async (): Promise<AliasEntry[]> =>
  aliasTable(await User.findAll({ attributes: ["name", "email"], raw: true }) as any);

export const domainOf = (address: string): string => String(address || "").split("@")[1]?.toLowerCase() || "";

// The addresses an incoming e-mail goes to: the owner of each address of the domain it was sent to; without an owner, the fallback list.
export const forwardTargets = (to: string[], domain: string, table: AliasEntry[], fallback: string[]): string[] => {
  const owners = new Map(table.filter(r => !r.shared).map(r => [r.alias, r.email]));
  const out = new Set<string>();
  let orphan = false;
  to.map(a => String(a || "").replace(/^.*</, "").replace(/>.*$/, "").trim().toLowerCase())
    .filter(a => domainOf(a) === domain)
    .forEach(a => { const owner = owners.get(a.split("@")[0]); if (owner) out.add(owner); else orphan = true; });
  if (orphan || !out.size) fallback.filter(isEmail).forEach(f => out.add(f.toLowerCase()));
  return [...out];
};
