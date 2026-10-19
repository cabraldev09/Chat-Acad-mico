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

