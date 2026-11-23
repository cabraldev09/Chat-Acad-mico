import Polo from "../../models/Polo";
import Queue from "../../models/Queue";
import User from "../../models/User";
import { offeredCourses } from "./Academic";
import { logger } from "../../utils/logger";
import { resolvePoloFor } from "../PoloServices/ResolvePolo";
import { cityCandidateOf } from "./Rules";

// What a message says about the course and the city, found by looking at the real catalogue and the real polos (no model): "Quero fazer Pedagogia",
// "Quanto custa Criminologia?" and "Sou de Buritis" fill the course and the city at once, so a price question handed to the consultant already carries them.
const plain = (s: string): string =>
  String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

const hasWords = (haystack: string, needle: string): boolean => needle.length >= 4 && (` ${haystack} `).includes(` ${needle} `);

let polosCache: { at: number; list: Array<{ name: string; city: string }> } | null = null;
const polos = async (): Promise<Array<{ name: string; city: string }>> => {
  if (polosCache && Date.now() - polosCache.at < 5000) return polosCache.list;
  const rows = await Polo.findAll({ where: { active: true } as any, attributes: ["name", "city"] });
  polosCache = { at: Date.now(), list: rows.map(p => ({ name: p.name, city: String(p.city || "") })) };
  return polosCache.list;
};
// a polo created, edited or removed is seen by the next message, not five seconds later
const dropPolosCache = (): void => { polosCache = null; };
Polo.addHook("afterSave", dropPolosCache);
Polo.addHook("afterDestroy", dropPolosCache);
Polo.addHook("afterBulkUpdate", dropPolosCache);
Polo.addHook("afterBulkDestroy", dropPolosCache);

// how people write a course or a city in a hurry ("fisio", "rh", "adm", "pvh")
const COURSE_ALIASES: Array<[RegExp, string]> = [
  [/\bfisio\b/g, "fisioterapia"], [/\brh\b/g, "recursos humanos"], [/\badm\b/g, "administracao"], [/\bed\.? ?fisica\b/g, "educacao fisica"],
  [/\bads\b/g, "analise e desenvolvimento de sistemas"], [/\bbiomed\b/g, "biomedicina"], [/\bnutri\b/g, "nutricao"], [/\bfono\b/g, "fonoaudiologia"],
  [/\bcontabilidade\b/g, "ciencias contabeis"], [/\bpedago\b/g, "pedagogia"]
];
const CITY_ALIASES: Array<[RegExp, string]> = [[/\bpvh\b/g, "porto velho"], [/\bjipa\b/g, "ji parana"]];
const distance = (a: string, b: string): number => {
  const m = a.length, n = b.length;
  if (Math.abs(m - n) > 2) return 9;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i += 1) {
    const row = [i];
    for (let j = 1; j <= n; j += 1) row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = row;
  }
  return prev[n];
};
// a name written with a typo ("biomedisina", "fisoterapia", "pedagojia"): the same number of words, the same first letter, one or two letters off
const nearName = (t: string, n: string): boolean => {
  if (n.length < 7) return false;
  const words = t.split(" ");
  const size = n.split(" ").length;
  for (let i = 0; i + size <= words.length; i += 1) {
    const gram = words.slice(i, i + size).join(" ");
    if (gram[0] === n[0] && gram !== n && distance(gram, n) <= (n.length >= 11 ? 2 : 1)) return true;
  }
  return false;
};
// the course the person WANTS, when another one is named with it ("já tenho pedagogia e quero fazer nutrição", "faço fisio mas quero mudar pra TO")
const WISH = /\b(quero (fazer|cursar|estudar|mudar (pra|para)|ir (pra|para)|transferir (pra|para)|comecar)|queria (fazer|cursar)|gostaria de (fazer|cursar)|prefiro|interesse em|pretendo (fazer|cursar)|penso em (fazer|cursar)) /g;

export const detectFromText = async (text: string): Promise<Record<string, any>> => {
  let t = plain(text);
  if (!t) return {};
  COURSE_ALIASES.forEach(([r, v]) => { t = t.replace(r, v); });
  CITY_ALIASES.forEach(([r, v]) => { t = t.replace(r, v); });
  const out: Record<string, any> = {};
  // a course of the catalogue named in full (the longest name wins: "Administração Pública" before "Administração")
  // (the catalogue names some courses "Cst Em Empreendedorismo": the person says "Empreendedorismo", so the name without that prefix counts too)
  const named = (await offeredCourses().catch(() => [])).flatMap(c => {
    const full = plain(c.name);
    const bare = full.replace(/^(cst|curso superior de tecnologia|tecnologo|tecnologia|bacharelado|licenciatura) (em|de|do|da) /, "");
    return [{ c, n: full }, ...(bare !== full && bare.length >= 6 ? [{ c, n: bare }] : [])];
  });
  let courses = named.filter(x => x.n && hasWords(t, x.n)).sort((a, b) => b.n.length - a.n.length);
  // nothing written right: a name with a typo counts when only one course is that close
  if (!courses.length) {
    const near = named.filter(x => x.n && nearName(t, x.n));
    if (new Set(near.map(x => x.c.id || x.c.name)).size === 1) courses = [near[0]];
  }
  const top = courses[0];
  const others = courses.filter(x => x.c !== top?.c && !top!.n.includes(x.n));
  if (top && !others.length) {
    out.courseName = top.c.name;
    if (top.c.id) out.courseId = top.c.id;
  } else if (top) {
    // two different courses: the one after "quero fazer", "prefiro", "quero mudar pra" is the choice; without that it is a comparison, nothing is decided
    let wishAt = -1;
    for (const m of t.matchAll(WISH)) wishAt = (m.index || 0) + m[0].length - 1;
    const after = wishAt >= 0 ? [top, ...others].map(x => ({ x, at: t.indexOf(x.n) })).filter(o => o.at >= wishAt).sort((a, b) => a.at - b.at)[0] : null;
    if (after) {
      out.courseName = after.x.c.name;
      if (after.x.c.id) out.courseId = after.x.c.id;
    } else out.courseOptions = [...new Set([top, ...others].map(x => x.c.name))].slice(0, 3);
  }
  // a city of a polo named in the message
  const list = await polos().catch((err: any) => { logger.warn(`detect: polos not read: ${err?.message}`); return []; });
  const cities = list.map(p => ({ p, n: plain(p.city) })).filter(x => x.n && hasWords(t, x.n));
  if (!cities.length && / cidade /.test(` ${t} `)) logger.warn(`detect: no city in "${t}" among ${JSON.stringify(list)}`);
  const uniq = [...new Set(cities.map(x => x.n))];
  if (uniq.length === 1) out.city = cities[0].p.city;
  // not the city of a polo: a town one of the polos serves ("moro em Candeias", "sou de Itapuã", or just the name of the town as the answer),
  // matched like the tool does (accents, typos, the state), so the polo of the lead does not depend on the model calling listar_polos
  if (!out.city) {
    const said = cityCandidateOf(text, !!out.courseName);
    if (said) {
      const r = await resolvePoloFor(said, null).catch(() => null);
      if (r && r.status === "found" && r.polo) Object.assign(out, { city: said, poloId: r.polo.id, poloName: r.polo.name, poloStatus: "found", ...(r.state ? { state: r.state } : {}) });
    }
  }
  return out;
};

// The consultant a person named ("Quero falar com João"): someone of a commercial team whose first name is that one. Two people with the same first
// name is not a choice the system can make, so nothing is chosen (the handoff goes by the polo and the lead is told nothing wrong).
export const findConsultantByName = async (name: string): Promise<{ id: number; name: string } | null> => {
  const want = plain(name);
  if (want.length < 3) return null;
  const queues = await Queue.findAll({ where: { role: "comercial" } as any, include: [{ model: User, as: "users", attributes: ["id", "name"], required: true }] });
  const users = new Map<number, string>();
  queues.forEach(q => ((q as any).users || []).forEach((u: User) => users.set(u.id, u.name)));
  const hits = [...users.entries()].filter(([, n]) => plain(n).split(" ")[0] === want);
  return hits.length === 1 ? { id: hits[0][0], name: hits[0][1] } : null;
};
