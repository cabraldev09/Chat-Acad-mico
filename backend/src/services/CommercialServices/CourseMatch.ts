// One way of recognising the course a person names, used by everything that looks for a course (the detector of the turn, the search tool of
// the model, the "not offered" check). No database here: the catalogue comes as a list, so the rules can be tested alone.
//
// People do not write the name of the catalogue: they write "RH", "ADS", "ed física", "gestão de pessoas", "recursos humanos" for
// "Cst Em Gestão De Recursos Humanos". And the catalogue repeats a course under other labels ("Educação Física (Área Básica De Ingresso)",
// "Cst Em Criminologia" beside "Criminologia"): to the person they are one course. The "2.0" courses are not that: they are different courses,
// chosen only when the person says "2.0".

export interface CatalogCourse { id?: number; name: string; level?: string | null; modality?: string | null; aliases?: string | null }

export const foldCourse = (s: string): string =>
  String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

const DEGREE_PREFIX = /^(cst|curso superior de tecnologia|superior de tecnologia|tecnologo|tecnologia|bacharelado|licenciatura|segunda licenciatura|graduacao) (em|de|do|da) /;
const TAIL = / (bacharelado|licenciatura|tecnologo|ead|semipresencial|semi presencial|presencial|a distancia)$/;

// what the person would call the course: without the degree in front, what is between brackets and the format
// (a "2.0" stays: "Educação Física 2.0" is ANOTHER course of the institution, not a label of "Educação Física")
export const coreOf = (name: string): string => {
  let n = foldCourse(String(name || "").replace(/\([^)]*\)/g, " "));
  for (let i = 0; i < 3; i += 1) n = n.replace(DEGREE_PREFIX, "").replace(TAIL, "").trim();
  return n;
};

// how people write a course in a hurry; the right side is in the words of the catalogue (without accents)
const ALIASES: Array<[RegExp, string]> = [
  [/\b(dois|2) ponto (zero|0)\b/g, "2 0"],
  [/\brh\b/g, "recursos humanos"], [/\bgestao de pessoas\b/g, "recursos humanos"], [/\bdepartamento pessoal\b/g, "recursos humanos"],
  [/\bads\b/g, "analise e desenvolvimento de sistemas"], [/\banalise de sistemas\b/g, "analise e desenvolvimento de sistemas"],
  [/\badm\b/g, "administracao"], [/\badministracao de empresas\b/g, "administracao"],
  [/\bed\.? ?fisica\b/g, "educacao fisica"],
  [/\bfisio\b/g, "fisioterapia"], [/\bbiomed\b/g, "biomedicina"], [/\bnutri\b/g, "nutricao"], [/\bfono\b/g, "fonoaudiologia"],
  [/\bpedago\b/g, "pedagogia"], [/\bpsicopedago\b/g, "psicopedagogia"],
  [/\bcontabilidade\b/g, "ciencias contabeis"], [/(?<!ciencias )\bcontabeis\b/g, "ciencias contabeis"],
  [/\beconomia\b/g, "ciencias economicas"], [/\bbiologia\b/g, "ciencias biologicas"],
  [/\bgti\b/g, "gestao da tecnologia da informacao"], [/\bmkt\b/g, "marketing"], [/\bcomex\b/g, "comercio exterior"],
  [/\bpublicidade\b(?! e propaganda)/g, "publicidade e propaganda"], [/\barquitetura\b(?! e urbanismo)/g, "arquitetura e urbanismo"],
  [/\bestetica\b(?! e cosmetica)/g, "estetica e cosmetica"], [/\bseguranca do trabalho\b/g, "seguranca no trabalho"]
];
export const expandAliases = (folded: string): string => ALIASES.reduce((t, [r, v]) => t.replace(r, v), folded);

const hasWords = (haystack: string, needle: string): boolean => !!needle && (` ${haystack} `).includes(` ${needle} `);
const LINK = new Set(["de", "da", "do", "das", "dos", "e", "em", "no", "na", "para", "a", "o"]);
// words that are in too many names to point to one course by themselves
const GENERIC = new Set([
  "gestao", "tecnologia", "sistemas", "ciencias", "ciencia", "engenharia", "social", "sociais", "publica", "publico", "digital", "digitais", "analise", "desenvolvimento", "educacao",
  "seguranca", "servicos", "processos", "comercio", "design", "saude", "informacao", "producao", "negocios", "recursos", "humanos", "dados", "computacao", "trabalho",
  "internet", "estudos", "curso", "cursos", "area", "fisica", "portugues", "ingles", "performance", "integrada", "basica", "ingresso",
  "coisas", "produto", "alta", "experiencia", "privada", "exterior", "organizacoes", "terceiro", "setor", "lazer", "back", "end", "full", "stack", "mobile", "interdisciplinar",
  // adjectives of everyday talk ("falar com o comercial", "ajuda financeira", "qual a qualidade"): never a course by themselves
  "comercial", "financeira", "financeiro", "qualidade", "especial", "ambiental", "hospitalar", "industrial", "cultural", "visuais", "civil", "internacionais", "publicas",
  "eletrica", "mecanica", "politica", "economicas", "biologicas", "juridicos", "penais", "gerenciais", "midiatica", "audiovisual", "imobiliarios", "desportiva"
]);
const strong = (w: string): boolean => w.length >= 4 && !LINK.has(w) && !GENERIC.has(w);

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
// a name written with a typo ("biomedisina", "fisoterapia"): the same number of words, the same first letter, one or two letters off
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

// a lone word of a name ("contábeis", "jogos", "moda") only counts right after the person says it is a course they mean, or when the
// message is little more than that word
const CUE = /\b(curso|cursos|faculdade|graduacao|bacharelado|licenciatura|tecnologo|cursar|estudar) (de |em |do |da |sobre )?$|\b(quero|queria|gostaria de|pretendo|penso em) (fazer|cursar|estudar) (o |a |um |uma )?(curso (de |em )?)?$/;

export interface CourseHit<T extends CatalogCourse> { core: string; course: T; variants: T[]; at: number; how: "name" | "alias" | "part" | "typo" }

// the course of a family the person means when nothing else is said: the plain name ("Educação Física" before "Educação Física (Área
// Básica De Ingresso)", "Criminologia" before "Cst Em Criminologia"), in the format they named when they named one
const pickVariant = <T extends CatalogCourse>(variants: T[], text: string): T => {
  const wantsSemi = /\bsemi ?presencial\b/.test(text);
  const wantsEad = !wantsSemi && /\b(ead|a distancia|online|100 ead)\b/.test(text);
  const score = (c: T): number => {
    const folded = foldCourse(c.name);
    const mod = foldCourse(c.modality || "");
    return (folded === coreOf(c.name) ? 20 : 0) + (/\(/.test(c.name) ? -4 : 0)
      + (wantsSemi && mod.includes("semi") ? 10 : 0) + (wantsEad && mod.includes("ead") ? 10 : 0) - Math.min(c.name.length, 80) / 100;
  };
  return [...variants].sort((a, b) => score(b) - score(a))[0];
};

/**
 * The courses of the catalogue a message names, one per family, in the order they appear in the message.
 * Nothing found is an empty list; two different courses come as two hits (the caller decides: a choice or a comparison).
 */
export const matchCourses = <T extends CatalogCourse>(text: string, list: T[]): CourseHit<T>[] => {
  const raw = foldCourse(text);
  if (!raw || !list.length) return [];
  const t = expandAliases(raw);
  const families = new Map<string, T[]>();
  list.forEach(c => { const core = coreOf(c.name); if (core) families.set(core, [...(families.get(core) || []), c]); });
  const found = new Map<string, { at: number; how: CourseHit<T>["how"] }>();
  const add = (core: string, at: number, how: CourseHit<T>["how"]) => { const old = found.get(core); if (!old || at < old.at) found.set(core, { at, how: old ? old.how : how }); };

  // 1) the name the team gave the course in "Outros nomes e siglas"
  list.forEach(c => String(c.aliases || "").split(/[,;\n]/).map(foldCourse).filter(a => a.length >= 2).forEach(a => { if (hasWords(raw, a)) add(coreOf(c.name), (` ${raw} `).indexOf(` ${a} `), "alias"); }));
  // 2) the name of the course, whole (also after "rh" became "recursos humanos")
  families.forEach((_, core) => { if (core.length >= 4 && hasWords(t, core)) add(core, (` ${t} `).indexOf(` ${core} `), hasWords(raw, core) ? "name" : "alias"); });
  // a longer name wins over the shorter one inside it ("Administração Pública" before "Administração", "Educação Física" before "Física")
  [...found.keys()].forEach(core => { if ([...found.keys()].some(other => other !== core && hasWords(other, core) && hasWords(t, other))) found.delete(core); });

  // 3) part of the name: "recursos humanos" for "Gestão De Recursos Humanos", "contábeis" for "Ciências Contábeis"
  if (!found.size) {
    const words = t.split(" ");
    const partOf = new Map<string, Set<string>>();
    families.forEach((_, core) => {
      const cw = core.split(" ");
      if (cw.length < 2) return;
      for (let size = cw.length - 1; size >= 1; size -= 1) {
        for (let i = 0; i + size <= cw.length; i += 1) {
          const gram = cw.slice(i, i + size);
          // two words of the name (not counting "de", "e"), or one word that is specific enough
          if (!(size >= 2 ? gram.filter(w => !LINK.has(w)).length >= 2 && !LINK.has(gram[0]) && !LINK.has(gram[gram.length - 1]) : strong(gram[0]))) continue;
          const g = gram.join(" ");
          if (hasWords(t, g)) partOf.set(g, new Set([...(partOf.get(g) || []), core]));
        }
      }
    });
    // the longest part said decides; a part that fits more than four courses says too little
    const parts = [...partOf.entries()].sort((a, b) => b[0].length - a[0].length);
    const best = parts[0];
    if (best && best[1].size <= 4) {
      const at = (` ${t} `).indexOf(` ${best[0]} `);
      const single = best[0].split(" ").length === 1;
      const cued = words.length <= 3 || CUE.test(t.slice(0, Math.max(0, at)));
      if (!single || cued) best[1].forEach(core => add(core, at, "part"));
    }
  }
  // 4) a typo, when only one course is that close
  if (!found.size) {
    const near = [...families.keys()].filter(core => nearName(t, core));
    if (near.length === 1) add(near[0], 0, "typo");
  }
  return [...found.entries()].sort((a, b) => a[1].at - b[1].at).map(([core, v]) => {
    const variants = families.get(core) || [];
    return { core, course: pickVariant(variants, t), variants, at: v.at, how: v.how };
  });
};

// are these two names the same course to the person ("Cst Em Criminologia" and "Criminologia", "Educação Física 2.0" and "Educação Física")?
export const sameCourseName = (a: string, b: string): boolean => !!coreOf(a) && coreOf(a) === coreOf(b);
