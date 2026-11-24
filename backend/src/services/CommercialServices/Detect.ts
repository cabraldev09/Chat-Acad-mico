import Polo from "../../models/Polo";
import Queue from "../../models/Queue";
import User from "../../models/User";
import { offeredCourses } from "./Academic";
import { logger } from "../../utils/logger";
import { resolvePoloFor } from "../PoloServices/ResolvePolo";
import { cityCandidateOf } from "./Rules";
import { expandAliases, matchCourses } from "./CourseMatch";

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

// how people write a city in a hurry ("pvh"); the courses have their own table (CourseMatch.ts)
const CITY_ALIASES: Array<[RegExp, string]> = [[/\bpvh\b/g, "porto velho"], [/\bjipa\b/g, "ji parana"]];
// the course the person WANTS, when another one is named with it ("já tenho pedagogia e quero fazer nutrição", "faço fisio mas quero mudar pra TO")
const WISH = /\b(quero (fazer|cursar|estudar|mudar (pra|para)|ir (pra|para)|transferir (pra|para)|comecar)|queria (fazer|cursar)|gostaria de (fazer|cursar)|prefiro|interesse em|interesse (no|na|pelo|pela)|(quero|queria|gostaria de) saber (mais )?(de|do|da|sobre)|informac\w+ (de|do|da|sobre)|(quero|queria) (o|a) |mudar de curso|trocar de curso|trocar (pra|para)|pretendo (fazer|cursar)|penso em (fazer|cursar)) /g;

export const detectFromText = async (text: string): Promise<Record<string, any>> => {
  let t = plain(text);
  if (!t) return {};
  CITY_ALIASES.forEach(([r, v]) => { t = t.replace(r, v); });
  const out: Record<string, any> = {};
  // the courses of the catalogue the message names (by the name, a nickname, part of the name or with a typo), one per course: CourseMatch.ts
  const hits = matchCourses(text, await offeredCourses().catch(() => []));
  const expanded = expandAliases(plain(text));
  // "quero fazer", "prefiro", "quero mudar pra": what comes after it is the choice
  let wishAt = -1;
  for (const m of expanded.matchAll(WISH)) wishAt = (m.index || 0) + m[0].length - 1;
  if (hits.length === 1) {
    out.courseName = hits[0].course.name;
    if (hits[0].course.id) out.courseId = hits[0].course.id;
    if (wishAt >= 0 && hits[0].at >= wishAt - 1) out.courseWished = true;
  } else if (hits.length > 1) {
    // two different courses: the one after the wish is the choice; without that it is a comparison (or a part of a name that fits a few), nothing is decided
    const after = wishAt >= 0 ? hits.filter(h => h.at >= wishAt - 1)[0] : null;
    if (after) {
      out.courseName = after.course.name;
      if (after.course.id) out.courseId = after.course.id;
      out.courseWished = true;
    } else out.courseOptions = hits.map(h => h.course.name).slice(0, 4);
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
