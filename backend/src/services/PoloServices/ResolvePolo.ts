import Polo from "../../models/Polo";
import PoloCoverage from "../../models/PoloCoverage";
import { forget, remember } from "../../helpers/TtlCache";
import { matchPolo, normalize } from "../FlowServices/Engine";

// WHICH POLO A LEAD BELONGS TO. One place decides it for the agent, the tools, the router and the flow blocks:
//   1. the cities each polo serves (PoloCoverages) and the city written on the polo, matched ignoring accents, punctuation and small
//      typos ("moro em ji parana", "Porto Velho - RO");
//   2. a state alone ("Rondônia", "RO") points to the polos of that state, and the person is asked which one is closer;
//   3. nothing fits: the lead is asked for the state and, with no polo there either, the central team follows the conversation.
export type PoloStatus = "found" | "ambiguous" | "none";

export interface PoloResolution {
  status: PoloStatus;
  polo: Polo | null;
  // the polos that fit when more than one does (or the polos of the state that was named)
  candidates: Polo[];
  // the state the answer named, when it did
  state: string | null;
}

const STATES: Record<string, string> = {
  acre: "AC", alagoas: "AL", amapa: "AP", amazonas: "AM", bahia: "BA", ceara: "CE", "distrito federal": "DF", "espirito santo": "ES", goias: "GO", maranhao: "MA",
  "mato grosso do sul": "MS", "mato grosso": "MT", "minas gerais": "MG", para: "PA", paraiba: "PB", parana: "PR", pernambuco: "PE", piaui: "PI", "rio de janeiro": "RJ",
  "rio grande do norte": "RN", "rio grande do sul": "RS", rondonia: "RO", roraima: "RR", "santa catarina": "SC", "sao paulo": "SP", sergipe: "SE", tocantins: "TO"
};
const UFS = new Set(Object.values(STATES));

const plain = (s: string): string => normalize(s).replace(/[^a-z0-9]+/g, " ").trim();
export const cityKeyOf = plain;

// "RO", "Rondônia" (alone) or "... - RO" at the end of the answer
export const stateOf = (text: string | null | undefined): string | null => {
  const raw = String(text || "").trim();
  if (!raw) return null;
  const p = plain(raw);
  if (STATES[p]) return STATES[p];
  if (p.length === 2 && UFS.has(p.toUpperCase())) return p.toUpperCase();
  const tail = raw.match(/[-,/]\s*([A-Za-z]{2})\s*$/);
  if (tail && UFS.has(tail[1].toUpperCase())) return tail[1].toUpperCase();
  return null;
};

interface Loaded {
  polos: Polo[];
  coverage: PoloCoverage[];
}

const load = (): Promise<Loaded> =>
  remember("polos:coverage", 20000, async () => ({
    polos: await Polo.findAll({ where: { active: true }, order: [["name", "ASC"]] }),
    coverage: await PoloCoverage.findAll()
  }));

// the polos or their coverage were edited: the next question reads them again
export const forgetPolos = (): void => forget("polos:");

export const resolvePoloFor = async (cityText?: string | null, stateText?: string | null): Promise<PoloResolution> => {
  const text = String(cityText || "").trim();
  const none = (state: string | null = null): PoloResolution => ({ status: "none", polo: null, candidates: [], state });
  if (!text && !stateText) return none();
  // a bare number is a menu choice, never a city
  if (/^\d+$/.test(plain(text))) return none();
  const { polos, coverage } = await load();
  const byId = new Map(polos.map(p => [p.id, p]));
  const state = stateOf(stateText) || stateOf(text);

  // only a state: the polos of that state (a single one is the answer)
  if (state && (!text || plain(text) === plain(state) || STATES[plain(text)] === state)) {
    const inState = polos.filter(p => String(p.state || "").toUpperCase() === state);
    if (inState.length === 1) return { status: "found", polo: inState[0], candidates: [], state };
    return inState.length ? { status: "ambiguous", polo: null, candidates: inState, state } : none(state);
  }

  // the city: coverage rows and the polos' own cities, in the same state when one was named
  const options: Array<{ id: number; name: string; city: string; state: string | null }> = [];
  polos.forEach(p => options.push({ id: p.id, name: p.name, city: p.city || "", state: p.state || null }));
  coverage.forEach(c => {
    const polo = byId.get(c.poloId);
    if (polo) options.push({ id: polo.id, name: polo.name, city: c.city, state: c.state || polo.state || null });
  });
  const usable = state ? options.filter(o => !o.state || o.state.toUpperCase() === state) : options;
  const found = matchPolo(usable, text.replace(/[-,/]\s*[A-Za-z]{2}\s*$/, ""));
  const ids = found.polo ? [found.polo.id] : found.ambiguous ? [...new Set(found.ambiguous.map(p => p.id))] : [];
  if (ids.length === 1) return { status: "found", polo: byId.get(ids[0]) || null, candidates: [], state };
  if (ids.length > 1) return { status: "ambiguous", polo: null, candidates: ids.map(id => byId.get(id)).filter(Boolean) as Polo[], state };
  return none(state);
};
