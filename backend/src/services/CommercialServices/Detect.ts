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

export const detectFromText = async (text: string): Promise<Record<string, any>> => {
  const t = plain(text);
  if (!t) return {};
  const out: Record<string, any> = {};
  // a course of the catalogue named in full (the longest name wins: "Administração Pública" before "Administração")
  const courses = (await offeredCourses().catch(() => [])).map(c => ({ c, n: plain(c.name) })).filter(x => x.n && hasWords(t, x.n)).sort((a, b) => b.n.length - a.n.length);
  const top = courses[0];
  // two different courses in one message is a comparison, not a choice: nothing is decided
  if (top && !courses.some(x => x !== top && !top.n.includes(x.n))) {
    out.courseName = top.c.name;
    if (top.c.id) out.courseId = top.c.id;
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
