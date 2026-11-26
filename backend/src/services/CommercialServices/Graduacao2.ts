// Graduação 2.0: a second degree for who already graduated in specific courses, with a shorter path that reuses the first degree. Each 2.0
// course has its own entry requirement: it is never offered to someone who does not have that degree, and the consultant confirms it with
// the diploma. Only the courses the catalogue of the system has as "… 2.0" are used; the table below says who may take each one and for how
// long (the institutional table of the 2.0 courses; the semesters depend on the previous degree).
import { coreOf, expandAliases, foldCourse } from "./CourseMatch";

interface Route { from: string[]; label: string; semesters: number }
interface Track { base: string; routes: Route[]; degreeNote?: string }

// the business tecnólogos that open Administração 2.0
const BUSINESS_CST = ["gestao comercial", "gestao financeira", "gestao publica", "gestao de recursos humanos", "gestao da qualidade", "gestao da producao industrial", "gestao do agronegocio", "gestao de cooperativas", "gestao de negocios imobiliarios", "gestao de turismo", "gestao hospitalar", "logistica", "marketing", "marketing digital", "processos gerenciais", "comercio exterior", "secretariado", "empreendedorismo"];

const TRACKS: Track[] = [
  { base: "administracao", routes: [{ from: ["ciencias contabeis", "gestao da tecnologia da informacao", ...BUSINESS_CST], label: "Ciências Contábeis, Gestão da Tecnologia da Informação ou um curso tecnólogo da área de negócios", semesters: 4 }] },
  { base: "ciencias contabeis", routes: [{ from: ["administracao", "administracao publica", "ciencias economicas", "ciencias atuariais"], label: "Administração, Administração Pública, Ciências Econômicas ou Ciências Atuariais", semesters: 2 }] },
  { base: "ciencias economicas", routes: [{ from: ["administracao", "administracao publica"], label: "Administração ou Administração Pública", semesters: 4 }] },
  { base: "educacao fisica", degreeNote: "licenciatura", routes: [{ from: ["educacao fisica"], label: "Licenciatura em Educação Física", semesters: 4 }] },
  { base: "engenharia ambiental", routes: [
    { from: ["engenharia civil"], label: "Engenharia Civil", semesters: 5 },
    { from: ["engenharia eletrica", "engenharia de producao", "engenharia mecanica", "gestao ambiental"], label: "Engenharia Elétrica, de Produção, Mecânica ou Gestão Ambiental (tecnólogo)", semesters: 6 }
  ] },
  { base: "engenharia de producao", routes: [
    { from: ["engenharia civil", "engenharia eletrica", "engenharia mecanica"], label: "Engenharia Civil, Elétrica ou Mecânica", semesters: 5 },
    { from: ["engenharia ambiental", "gestao da producao industrial"], label: "Engenharia Ambiental ou Gestão da Produção Industrial (tecnólogo)", semesters: 6 }
  ] }
];

export const is20 = (name: string): boolean => / 2 0$/.test(coreOf(name));
const baseOf = (name: string): string => coreOf(name).replace(/ 2 0$/, "");
export const trackOf = (name: string): Track | null => TRACKS.find(t => t.base === baseOf(name)) || null;

// "Educação Física 2.0" of the catalogue for a plain "Educação Física", and the other way round
export const twinOf = <T extends { name: string }>(name: string, list: T[]): T | null => {
  const base = baseOf(name);
  return list.find(c => (is20(name) ? !is20(c.name) && coreOf(c.name) === base : is20(c.name) && baseOf(c.name) === base)) || null;
};

const hasWords = (haystack: string, needle: string): boolean => (` ${haystack} `).includes(` ${needle} `);
const NOT_LICENCIATURA = /\b(bacharel|bacharelado|bacharela)\b/;

/** The route of the 2.0 course the previous degree opens; null when it opens none; undefined when the previous degree is not known. */
export const routeFor = (name: string, previous: string | null | undefined): Route | null | undefined => {
  const track = trackOf(name);
  if (!track) return null;
  const said = String(previous || "").trim();
  if (!said) return undefined;
  const folded = expandAliases(foldCourse(said));
  const core = coreOf(said);
  if (track.degreeNote === "licenciatura" && NOT_LICENCIATURA.test(folded)) return null;
  // the whole name of an entry in the words, or the words being part of one ("recursos humanos" for "gestao de recursos humanos")
  const bare = folded.replace(/^(licenciatura|bacharelado|tecnologo|cst|graduacao) (em|de) /, "");
  return track.routes.find(r => r.from.some(f => core === f || hasWords(folded, f) || (bare.length >= 8 && hasWords(f, bare)))) || null;
};

// the previous degree in the person's words: "sou licenciado em educação física", "já me formei em administração", "tenho graduação em letras"
export const previousFrom = (text: string): string | null => {
  const t = foldCourse(text);
  const m = t.match(/\b(?:formad[oa]|graduad[oa]|licenciad[oa]|bacharel|tecnolog[oa]|me formei|ja fiz|ja cursei|conclui|terminei|tenho (?:graduacao|licenciatura|bacharelado|faculdade|diploma|formacao)(?: de)?)\s+(?:em |de |na |no )?(.{3,60}?)(?=\s+(?:e |mas |quero|queria|gostaria|agora|pra |para )|$)/);
  if (!m) return null;
  const kind = /licenciad|licenciatura/.test(m[0]) ? "Licenciatura em " : /bacharel/.test(m[0]) ? "Bacharelado em " : "";
  const what = m[1].replace(/\b(a|o|uma|um)\b /, "").trim();
  return what.length >= 3 ? `${kind}${what}` : null;
};

const label = (name: string): string => `*${String(name).replace(/\s+2\.0$/, "")} 2.0*`;
const plainLabel = (name: string): string => `*${String(name).replace(/\s+2\.0$/, "").replace(/\s*\([^)]*\)/, "")}*`;
const requirement = (t: Track): string => t.routes.map(r => r.label).join("; ou ");

// the person asked for a 2.0 course: who may take it, and whether they may (when the previous degree is known)
export const text20 = (name: string, previous: string | null | undefined): string | null => {
  const track = trackOf(name);
  if (!track) return null;
  const route = routeFor(name, previous);
  if (route === undefined) {
    const lens = [...new Set(track.routes.map(r => r.semesters))];
    return `A ${label(name)} é uma segunda graduação para quem já é formado em ${requirement(track)}. Ela aproveita a formação anterior e tem ${lens.length === 1 ? `${lens[0]} semestres` : `de ${Math.min(...lens)} a ${Math.max(...lens)} semestres, conforme a formação`}.\n\nVocê já tem essa formação?`;
  }
  if (route) return `Com a sua formação, você pode fazer a ${label(name)}: são ${route.semesters} semestres, aproveitando o que você já cursou. O consultor confirma pelo seu diploma.\n\nQuer seguir por ela?`;
  return `A ${label(name)} é só para quem já é formado em ${requirement(track)}. Para você, o caminho é a segunda graduação em ${plainLabel(name)}, com a análise do seu histórico para ver o que pode ser aproveitado.\n\nQuer seguir por ela?`;
};

// who said they do not have the degree a 2.0 course asks for: the regular course is the way
export const regularText = (name: string): string => `Sem essa formação, o caminho é o curso regular de ${plainLabel(name)}.\n\nQuer que eu te explique como ele funciona?`;

// a person with a previous degree that opens the 2.0 version of the course they asked for: the shorter path is offered (once)
export const offer20Text = (twinName: string, route: Route): string =>
  `Como você já é formado em uma área que dá acesso, também pode fazer pela Graduação 2.0: a ${label(twinName)} tem ${route.semesters} semestres e aproveita a sua formação. O consultor confirma pelo seu diploma.\n\nQuer seguir pela Graduação 2.0?`;

// for the prompt: the 2.0 courses of the catalogue and who may take each
export const graduacao2Block = (names: string[]): string => {
  const lines = names.filter(is20).map(n => { const t = trackOf(n); return t ? `- ${n.replace(/\s+2\.0$/, "")} 2.0: só para quem já é formado em ${requirement(t)}.` : null; }).filter(Boolean);
  if (!lines.length) return "";
  return ["Graduação 2.0 é segunda graduação com percurso mais curto, só para quem já tem a formação indicada (o consultor confirma pelo diploma). Nunca ofereça um curso 2.0 sem saber a formação anterior da pessoa, nunca a quem não tem essa formação, e nunca a quem ainda não tem graduação:", ...lines].join("\n");
};
