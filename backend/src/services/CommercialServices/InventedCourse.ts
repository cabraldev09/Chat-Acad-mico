// Courses people often ask for and an institution may not offer. An answer that affirms one of them (no "não", "nem", "nenhum" in the
// sentence) while the catalogue does not have it was invented by the model: "Enfermagem e Medicina são semipresenciais".
const ASKED_COURSES = [
  "Medicina Veterinária", "Medicina", "Enfermagem", "Odontologia", "Fisioterapia", "Psicologia", "Nutrição", "Farmácia", "Biomedicina", "Fonoaudiologia",
  "Radiologia", "Terapia Ocupacional", "Educação Física", "Estética e Cosmética", "Direito", "Arquitetura e Urbanismo", "Engenharia Civil",
  "Engenharia Elétrica", "Engenharia Mecânica", "Engenharia de Produção", "Engenharia de Software", "Engenharia", "Gastronomia", "Jornalismo",
  "Publicidade e Propaganda", "Ciências Contábeis", "Administração", "Pedagogia", "Serviço Social", "Letras", "História", "Geografia", "Matemática"
];
const plainName = (s: string): string => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
// (a course named in what the tools or the approved texts returned is not an invention: the rule of the MEC names Medicina and Direito)
export const inventedCourse = (reply: string, list: Array<{ name: string }>, evidence = ""): string | null => {
  if (!reply || !list.length) return null;
  const backed = plainName(evidence);
  const offered = list.map(c => plainName(c.name));
  const sentences = String(reply).split(/(?<=[.!?:;])\s+|\n+/).map(plainName).filter(Boolean);
  for (const name of ASKED_COURSES) {
    const n = plainName(name);
    const word = new RegExp(`\\b${n}\\b`);
    if (offered.some(o => word.test(o))) continue;
    if (backed && word.test(backed)) continue;
    if (sentences.some(t => word.test(t) && !/\b(nao|nem|nenhum|nenhuma|infelizmente|sem)\b/.test(t))) return name;
  }
  return null;
};
const joinNames = (names: string[]): string => (names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}`);
export const notOfferedWords = (name: string, close: string[], more: boolean): string =>
  close.length
    ? `Hoje a instituição não oferece o curso de ${name}. Entre os cursos que oferecemos estão ${joinNames(close.map(courseLabel))}${more ? ", entre outros" : ""}. Algum deles te interessa?`
    : `Hoje a instituição não oferece o curso de ${name}.`;

// "Cst Em Sistemas Para Internet" (as registered) → "Sistemas para Internet (tecnólogo)": what the person reads
const SMALL = new Set(["em", "de", "da", "do", "das", "dos", "para", "e", "a", "o", "com"]);
export const courseLabel = (name: string): string => {
  const raw = String(name || "").replace(/\s+/g, " ").trim();
  const tech = /^(cst|curso superior de tecnologia|tecnologia|tecn[oó]logo)\s+em\s+/i.test(raw);
  const base = raw.replace(/^(cst|curso superior de tecnologia|tecnologia|tecn[oó]logo)\s+em\s+/i, "");
  const cased = base.split(" ").map((w, i) => (i > 0 && SMALL.has(w.toLowerCase()) ? w.toLowerCase() : w)).join(" ");
  return tech ? `${cased} (tecnólogo)` : cased;
};

// "cursos na área da saúde": the area asked for, and the offered courses that are of it (by name; nothing is guessed)
export type AskedArea = "saude" | "tecnologia" | "gestao" | "educacao";
const AREA_ASK: Array<[AskedArea, RegExp]> = [
  ["saude", /\b(area|areas|cursos?|algo|opcoes|graduacao)\b.{0,30}\b(saude)\b/],
  ["tecnologia", /\b(area|areas|cursos?|algo|opcoes|graduacao)\b.{0,30}\b(tecnologia|ti|informatica|computacao|programacao)\b/],
  ["gestao", /\b(area|areas|cursos?|algo|opcoes|graduacao)\b.{0,30}\b(gestao|negocios|administrativa)\b/],
  ["educacao", /\b(area|areas|cursos?|algo|opcoes|graduacao)\b.{0,30}\b(educacao|licenciaturas?)\b/]
];
const AREA_COURSES: Record<AskedArea, RegExp> = {
  saude: /\b(saude|hospitalar|radiologia|biomedicina|farmacia|fisioterapia|nutricao|enfermagem|estetica|cosmetica|fonoaudiologia|terapia|podologia|gerontologia|optica|optometria|quiropraxia|naturologia|educacao fisica|psicologia|odontologia|medicina)\b/,
  tecnologia: /\b(sistemas|software|computacao|dados|redes|coding|inteligencia artificial|informacao|jogos|internet|ciberseguranca|seguranca cibernetica|devops|programacao|cloud|nuvem)\b/,
  gestao: /\b(gestao|administracao|processos gerenciais|logistica|marketing|recursos humanos|contabeis|comercio|comercial|financeira|financas|empreendedorismo|secretariado)\b/,
  educacao: /\b(pedagogia|letras|licenciatura|educacao especial|historia|geografia|matematica|filosofia|sociologia|ciencias biologicas|artes visuais)\b/
};
export const AREA_LABEL: Record<AskedArea, string> = { saude: "saúde", tecnologia: "tecnologia", gestao: "gestão", educacao: "educação" };
export const areaAsked = (text: string): AskedArea | null => {
  const t = plainName(text);
  if (!t || t.length > 200) return null;
  const hit = AREA_ASK.find(([, r]) => r.test(t));
  return hit ? hit[0] : null;
};
// "Quais são os cursos nessa área?": the area is not in the message, it is in what was just said (the last answer of the agent)
const AREA_WORD: Array<[AskedArea, RegExp]> = [
  ["saude", /\b(area|areas) (de |da )?saude\b/], ["tecnologia", /\b(area|areas) (de |da )?(tecnologia|ti)\b/],
  ["gestao", /\b(area|areas) (de |da )?(gestao|negocios)\b/], ["educacao", /\b(area|areas) (de |da )?educacao\b/]
];
export const areaInContext = (text: string, previous: string): AskedArea | null => {
  const t = plainName(text);
  if (!t || t.length > 120) return null;
  // the answer to "Qual dessas áreas combina mais...?": the area is in the words of the person
  if (/qual dessas areas|qual outra area/.test(plainName(previous))) { const own = AREA_WORDS.find(([, r]) => r.test(t)); if (own) return own[0]; }
  const refers = /\b(nessa|dessa|essa|nesta|desta|esta|na mesma) area\b/.test(t) || /^(e )?(quais|que) (sao )?(os |as )?(outros |outras |demais )?(cursos|opcoes|graduacoes)( (voces )?(tem|ofertam|oferecem))?$/.test(t);
  if (!refers) return null;
  const p = plainName(previous);
  const hit = AREA_WORD.find(([, r]) => r.test(p));
  return hit ? hit[0] : null;
};
export const coursesOfArea = <T extends { name: string }>(list: T[], area: AskedArea): T[] => list.filter(c => AREA_COURSES[area].test(plainName(c.name)));
const MODALITY_LABEL = (m: string | null | undefined): string => {
  const p = plainName(m || "");
  return p.includes("semi") ? "semipresencial" : p.includes("presencial") ? "presencial" : p ? "EAD" : "";
};
export const areaText = (area: AskedArea, list: Array<{ name: string; modality?: string | null }>): string => {
  const found = coursesOfArea(list, area).slice(0, 25);
  if (!found.length) return `Hoje a instituição não tem cursos cadastrados na área de ${AREA_LABEL[area]}.\n\nQual outra área ou curso te interessa?`;
  if (found.length === 1) return `Na área de ${AREA_LABEL[area]}, o curso que oferecemos é *${courseLabel(found[0].name)}*.\n\nQuer que eu te explique como ele funciona?`;
  return [`Na área de ${AREA_LABEL[area]}, oferecemos ${found.length} cursos:`, found.map(c => `- ${courseLabel(c.name)}`).join("\n"), "Qual deles te interessa?"].join("\n\n");
};
// the areas asked for in one message ("gestão ou educação?"), in the order of the list
export const areasAsked = (text: string): AskedArea[] => {
  const t = plainName(text);
  if (!t || t.length > 200) return [];
  if (!/\b(area|areas|cursos?|algo|opcoes|graduacao)\b/.test(t)) return [];
  return AREA_WORDS.filter(([, r]) => r.test(t)).map(([a]) => a);
};
const AREA_WORDS: Array<[AskedArea, RegExp]> = [["saude", /\bsaude\b/], ["tecnologia", /\b(tecnologia|ti|informatica|computacao|programacao)\b/], ["gestao", /\b(gestao|negocios)\b/], ["educacao", /\b(educacao|licenciaturas?)\b/]];
// the areas that have courses, offered to who does not know which course ("o que você indica?", "quais cursos tem?")
export const areasHelp = (list: Array<{ name: string }>): string | null => {
  const have = (Object.keys(AREA_LABEL) as AskedArea[]).filter(a => coursesOfArea(list, a).length);
  if (have.length < 2) return null;
  const names = have.map(a => AREA_LABEL[a]);
  return `Temos cursos nas áreas de ${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}.\n\nQual dessas áreas combina mais com o que você procura?`;
};
export const asksForCourses = (text: string): boolean =>
  /\b(quais (sao )?(os )?cursos|que cursos|lista de cursos|cursos (voces|vcs|vc|voce) tem|o que (voce|vc|voces|vcs) (indica|indicam|recomenda)|me indica|qualquer um|nao sei( ainda)?( qual)?|tanto faz|nao decidi|estou em duvida)\b/.test(plainName(text));

// A known course that is not offered, named without "curso de" ("Quero saber sobre enfermagem", or just "Enfermagem"): said by the system,
// never left to the model. A word that is also an ordinary word ("direito a bolsa") needs the wish around it.
const WISH = "(quero|queria|gostaria|fazer|cursar|estudar|saber|tem|tenho interesse|interesse|sobre|curso|cursos|faculdade|graduacao|e)";
export const unofferedMention = (text: string, list: Array<{ name: string }>): string | null => {
  const t = plainName(text);
  if (!t || t.length > 160 || !list.length) return null;
  const offered = list.map(c => plainName(c.name));
  for (const name of ASKED_COURSES) {
    const n = plainName(name);
    if (offered.some(o => new RegExp(`\\b${n}\\b`).test(o))) continue;
    if (!new RegExp(`\\b${n}\\b`).test(t)) continue;
    if (new RegExp(`\\b${n} (a|ao|de|do|da)\\b`).test(t) && n === "direito") continue;
    if (t.split(" ").length <= 3 || new RegExp(`\\b${WISH}\\b.{0,30}\\b${n}\\b`).test(t)) return name;
  }
  return null;
};
const areaOfName = (name: string): AskedArea | null => {
  const n = plainName(name);
  const hit = (Object.keys(AREA_COURSES) as AskedArea[]).find(a => AREA_COURSES[a].test(n));
  return hit || null;
};
// "we do not offer X": with the courses of the same area that are offered (the whole list), or else the closest ones
export const notOfferedReply = (name: string, list: Array<{ name: string; modality?: string | null }>, closest: string[]): string => {
  const area = areaOfName(name);
  if (area && coursesOfArea(list, area).length) return `Hoje a instituição não oferece o curso de ${name}.\n\n${areaText(area, list)}`;
  return notOfferedWords(name, closest, list.length > closest.length);
};

