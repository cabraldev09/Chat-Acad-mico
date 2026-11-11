// Which area of the Portaria MEC 378/2025 a course belongs to (pure: by name and degree)
export type AreaId = "presencial" | "saude_eng_agro" | "educacao_ciencias" | "livre";

export const plain = (s: string): string =>
  String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const ONLY_PRESENCIAL = /^(direito|enfermagem|medicina|odontologia|psicologia)\b(?! veterinaria)/;
const AGRO = /\b(veterinaria|zootecnia|agronomia|agronegocio|agricultura|silvicultura|florestal|pesca)\b/;
const HEALTH = /\b(biomedicina|farmacia|fisioterapia|nutricao|fonoaudiologia|terapia ocupacional|estetica|cosmetica|radiologia|podologia|gerontologia|terapias integrativas|quiropraxia|optometria|naturologia)\b/;
const ENGINEERING = /^(engenharia|arquitetura)|\b(urbanismo|construcao|producao industrial)\b/;
const TEACHING = /\b(pedagogia|letras|educacao especial|educacao basica|musica|licenciatura)\b/;
const NATURAL_SCIENCES = /^(matematica|fisica|quimica|estatistica|ciencias biologicas|biologia|ciencias da natureza|ciencias naturais)\b/;
const HUMANITIES_TEACHING = /^(historia|geografia|filosofia|ciencias sociais|artes visuais|educacao fisica)\b/;

// the degree comes from the commercial grade of the course (Bacharelado, Licenciatura, Tecnológico) when there is one
export const areaOf = (name: string, degree: string | null, catalogModality: string | null): AreaId => {
  const n = plain(name);
  const d = plain(degree || "");
  const licenciatura = d.includes("licenciatura") || /\blicenciatura\b/.test(n);
  if (ONLY_PRESENCIAL.test(n)) return "presencial";
  if (AGRO.test(n)) return "saude_eng_agro";
  // Educação Física: the teaching degree is Educação, the bachelor is Saúde
  if (/^educacao fisica/.test(n)) return licenciatura ? "educacao_ciencias" : "saude_eng_agro";
  if (HEALTH.test(n)) return "saude_eng_agro";
  // management courses that only mention health (Gestão da Saúde Pública, Gestão Hospitalar): impacted only when the catalogue already offers them as semipresencial
  if (/\b(saude|hospitalar)\b/.test(n) && plain(catalogModality || "").includes("semi")) return "saude_eng_agro";
  if (/^engenharia de software/.test(n)) return "livre";
  if (ENGINEERING.test(n)) return "saude_eng_agro";
  if (TEACHING.test(n) || licenciatura) return "educacao_ciencias";
  if (NATURAL_SCIENCES.test(n)) return "educacao_ciencias";
  // history, geography, philosophy, social sciences, visual arts: teaching degrees are Educação; the bachelor ones are not named by the Portaria
  if (HUMANITIES_TEACHING.test(n)) return licenciatura || (!d && plain(catalogModality || "").includes("semi")) ? "educacao_ciencias" : "livre";
  return "livre";
};


// What the Portaria MEC 378/2025 asks of a course, in one place: the grade, the consultant's panel, the agent and the screen of the courses read it from here.
// "livre" is a course the Portaria does not mention (most of the tecnólogos of management and IT): the institution offers it as EAD and it has no practical classes.
export type MecExigencia = "presencial" | "semipresencial" | "livre";
export interface MecRequirement {
  area: AreaId;
  exigencia: MecExigencia;
  // the format the student will find, in a word: EAD, Semipresencial or Presencial
  formato: "EAD" | "Semipresencial" | "Presencial";
  // minimum share of the workload in presential activities (the practical part); null when the course has none
  percentualPresencial: number | null;
  percentualSincrono: number | null;
  semPratica: boolean;
  fonte: string;
  // one line for the consultant ("EAD: sem aulas práticas", "Semipresencial: 40% de prática presencial")
  resumo: string;
}

const pct = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

export const mecRequirementOf = (area: AreaId, rule?: { mecImpacted?: boolean | null; percentualPresencial?: unknown; percentualSincrono?: unknown } | null): MecRequirement => {
  const p = pct(rule && rule.percentualPresencial);
  const s = pct(rule && rule.percentualSincrono);
  if (area === "presencial") {
    return { area, exigencia: "presencial", formato: "Presencial", percentualPresencial: p ?? 70, percentualSincrono: null, semPratica: false, fonte: "Portaria MEC nº 378/2025, art. 5º", resumo: `Presencial: só pode ser ofertado presencialmente (mínimo de ${p ?? 70}% de atividades presenciais)` };
  }
  if (area === "saude_eng_agro" || area === "educacao_ciencias") {
    const base = area === "saude_eng_agro" ? 40 : 30;
    const art = area === "saude_eng_agro" ? "arts. 8º e 9º" : "arts. 7º e 9º";
    return { area, exigencia: "semipresencial", formato: "Semipresencial", percentualPresencial: p ?? base, percentualSincrono: s ?? 20, semPratica: false, fonte: `Portaria MEC nº 378/2025, ${art}`, resumo: `Semipresencial: ${p ?? base}% de prática presencial (e ${s ?? 20}% presencial ou ao vivo)` };
  }
  // a course that is not mentioned, but that the team registered with a presential share, is explained with it
  if (rule && rule.mecImpacted === true && p && p > 0) {
    return { area, exigencia: "semipresencial", formato: "Semipresencial", percentualPresencial: p, percentualSincrono: s, semPratica: false, fonte: "Regra cadastrada pela instituição para o curso", resumo: `Semipresencial: ${p}% de prática presencial` };
  }
  return { area, exigencia: "livre", formato: "EAD", percentualPresencial: null, percentualSincrono: null, semPratica: true, fonte: "Portaria MEC nº 378/2025, art. 10 (curso não restringido)", resumo: "EAD: sem aulas práticas presenciais" };
};
