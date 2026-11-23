// Courses people often ask for and an institution may not offer. An answer that affirms one of them (no "não", "nem", "nenhum" in the
// sentence) while the catalogue does not have it was invented by the model: "Enfermagem e Medicina são semipresenciais".
const ASKED_COURSES = [
  "Medicina Veterinária", "Medicina", "Enfermagem", "Odontologia", "Fisioterapia", "Psicologia", "Nutrição", "Farmácia", "Biomedicina", "Fonoaudiologia",
  "Radiologia", "Terapia Ocupacional", "Educação Física", "Estética e Cosmética", "Direito", "Arquitetura e Urbanismo", "Engenharia Civil",
  "Engenharia Elétrica", "Engenharia Mecânica", "Engenharia de Produção", "Engenharia de Software", "Engenharia", "Gastronomia", "Jornalismo",
  "Publicidade e Propaganda", "Ciências Contábeis", "Administração", "Pedagogia", "Serviço Social", "Letras", "História", "Geografia", "Matemática"
];
const plainName = (s: string): string => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
export const inventedCourse = (reply: string, list: Array<{ name: string }>): string | null => {
  if (!reply || !list.length) return null;
  const offered = list.map(c => plainName(c.name));
  const sentences = String(reply).split(/(?<=[.!?:;])\s+|\n+/).map(plainName).filter(Boolean);
  for (const name of ASKED_COURSES) {
    const n = plainName(name);
    if (offered.some(o => o.includes(n))) continue;
    const word = new RegExp(`\\b${n}\\b`);
    if (sentences.some(t => word.test(t) && !/\b(nao|nem|nenhum|nenhuma|infelizmente|sem)\b/.test(t))) return name;
  }
  return null;
};
const joinNames = (names: string[]): string => (names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}`);
export const notOfferedWords = (name: string, close: string[], more: boolean): string =>
  close.length
    ? `Hoje a instituição não oferece o curso de ${name}. Os cursos que oferecemos incluem ${joinNames(close.map(courseLabel))}${more ? " e outros" : ""}. Algum deles te interessa?`
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
  const lines = found.map(c => { const m = MODALITY_LABEL(c.modality); return `- ${courseLabel(c.name)}${m ? `: ${m}` : ""}`; });
  return [`Na área de ${AREA_LABEL[area]}, ${found.length === 1 ? "o curso que oferecemos é" : `oferecemos ${found.length} cursos`}:`, lines.join("\n"), "Qual deles te interessa?"].join("\n\n");
};
