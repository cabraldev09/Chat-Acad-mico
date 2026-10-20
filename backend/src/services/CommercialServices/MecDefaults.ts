import { getSetting, setSetting } from "../../helpers/AppSettings";
import ChatFlow from "../../models/ChatFlow";
import CommercialGrade from "../../models/CommercialGrade";
import Course from "../../models/Course";
import CourseRegulation from "../../models/CourseRegulation";
import KbDocument from "../../models/KbDocument";
import { logger } from "../../utils/logger";
import { addDocument } from "../AiServices/Kb";
import { MEC_DOC, MEC_DOC_TITLE } from "./MecDoc";
import { AreaId, areaOf, plain } from "./MecAreas";

export { AreaId, areaOf };

// THE STANDARD OF THE MEC RULES, read from the Portaria MEC nº 378, de 19/05/2025 (DOU 20/05/2025). Each course falls in one area and
// gets that area's rule; the team adjusts the area once (and applies it to every course of the area) or edits a single course.
//   art. 5º  Direito, Enfermagem, Medicina, Odontologia e Psicologia: only presencial
//   art. 8º  bacharelado/tecnologia in Saúde e Bem-Estar; Engenharia, Produção e Construção; Agricultura, Silvicultura, Pesca e Veterinária:
//            semipresencial, at least 40% presencial (+ 20% presencial or synchronous mediated)
//   art. 7º  bacharelado/licenciatura/tecnologia in Educação and Ciências Naturais, Matemática e Estatística: at least 30% (+ 20%)
//   art. 9º  those courses cannot be offered 100% a distância
//   art. 10  courses not mentioned: any format allowed by the Decreto 12.456/2025 (not impacted)
// The classification of the course is by name and degree: when it is not sure, the course gets no rule (the agent says it will confirm).

export interface AreaRule {
  id: AreaId;
  label: string;
  article: string;
  mecImpacted: boolean | null;
  percentualPresencial: number | null;
  percentualSincrono: number | null;
  teoriaAoVivo: boolean | null;
  praticaPresencial: boolean | null;
  cronogramaPraticasDefinido: boolean | null;
  transitionStatus: string | null;
  currentDelivery: string | null;
  futureDelivery: string | null;
  transitionNote: string | null;
  commercialApprovedText: string | null;
}

const SEMI_NOTE = "O cronograma e a quantidade de encontros presenciais ainda não foram definidos pela instituição: só serão informados quando houver data oficial.";

const BASE: AreaRule[] = [
  {
    id: "presencial",
    label: "Somente presencial: Direito, Enfermagem, Medicina, Odontologia e Psicologia",
    article: "Portaria MEC nº 378/2025, art. 5º",
    mecImpacted: true,
    percentualPresencial: 70,
    percentualSincrono: null,
    teoriaAoVivo: null,
    praticaPresencial: true,
    cronogramaPraticasDefinido: null,
    transitionStatus: "somente_presencial",
    currentDelivery: null,
    futureDelivery: "Presencial",
    transitionNote: "A Portaria determina que estes cursos sejam ofertados exclusivamente no formato presencial (com pelo menos 70% da carga horária presencial; Medicina, integralmente presencial).",
    commercialApprovedText: "Pelas novas regras nacionais do MEC, este curso deve ser ofertado no formato presencial. Para saber como funciona na sua cidade, um consultor confirma com você."
  },
  {
    id: "saude_eng_agro",
    label: "Semipresencial com 40% presencial: Saúde e Bem-Estar, Engenharias, Agricultura e Veterinária",
    article: "Portaria MEC nº 378/2025, art. 8º",
    mecImpacted: true,
    percentualPresencial: 40,
    percentualSincrono: 20,
    teoriaAoVivo: true,
    praticaPresencial: true,
    cronogramaPraticasDefinido: false,
    transitionStatus: "em_adequacao",
    currentDelivery: null,
    futureDelivery: "Semipresencial",
    transitionNote: `Cursos de bacharelado e tecnologia destas áreas passam a ser semipresenciais, com pelo menos 40% de atividades presenciais. ${SEMI_NOTE}`,
    commercialApprovedText:
      "Com as mudanças do MEC, este curso passa a ser semipresencial. A parte teórica continua on-line, com aulas ao vivo, e há uma parte prática presencial, com no mínimo 40% da carga horária. A organização dos encontros presenciais ainda não foi definida; assim que for, a tutoria avisa com antecedência."
  },
  {
    id: "educacao_ciencias",
    label: "Semipresencial com 30% presencial: licenciaturas, Ciências Naturais, Matemática e Estatística",
    article: "Portaria MEC nº 378/2025, art. 7º",
    mecImpacted: true,
    percentualPresencial: 30,
    percentualSincrono: 20,
    teoriaAoVivo: true,
    praticaPresencial: true,
    cronogramaPraticasDefinido: false,
    transitionStatus: "em_adequacao",
    currentDelivery: null,
    futureDelivery: "Semipresencial",
    transitionNote: `Cursos de licenciatura (e de bacharelado/tecnologia em Educação, Ciências Naturais, Matemática e Estatística) passam a ser semipresenciais, com pelo menos 30% de atividades presenciais. ${SEMI_NOTE}`,
    commercialApprovedText:
      "Com as mudanças do MEC, este curso passa a ser semipresencial. A parte teórica continua on-line, com aulas ao vivo, e há uma parte presencial, com no mínimo 30% da carga horária. A organização dos encontros presenciais ainda não foi definida; assim que for, a tutoria avisa com antecedência."
  },
  {
    id: "livre",
    label: "Sem mudança: demais cursos (Administração, Contábeis, Tecnologia da Informação e outros)",
    article: "Portaria MEC nº 378/2025, art. 10",
    mecImpacted: false,
    percentualPresencial: null,
    percentualSincrono: null,
    teoriaAoVivo: null,
    praticaPresencial: null,
    cronogramaPraticasDefinido: null,
    transitionStatus: null,
    currentDelivery: null,
    futureDelivery: null,
    transitionNote: "Curso não citado na Portaria: segue nos formatos permitidos, sem mudança de modalidade por causa da nova regra.",
    commercialApprovedText: "Este curso não foi alterado pelas novas regras de modalidade do MEC e segue no formato atual."
  }
];

export const EDITABLE = ["mecImpacted", "percentualPresencial", "percentualSincrono", "teoriaAoVivo", "praticaPresencial", "cronogramaPraticasDefinido", "transitionNote", "commercialApprovedText"] as const;
const SETTING = "mec_area_defaults";
const SEEN = "mec_defaults_seen";
const VERSION = "378-2025-v1";

export const getAreas = async (): Promise<AreaRule[]> => {
  let saved: Record<string, any> = {};
  try {
    saved = JSON.parse(await getSetting(SETTING, "{}")) || {};
  } catch (_) {
    saved = {};
  }
  return BASE.map(a => {
    const over = saved[a.id] || {};
    const merged: any = { ...a };
    EDITABLE.forEach(k => {
      if (k in over) merged[k] = over[k];
    });
    return merged as AreaRule;
  });
};

export const saveArea = async (id: string, input: Record<string, any>): Promise<AreaRule> => {
  const base = BASE.find(a => a.id === id);
  if (!base) throw new Error("area");
  let saved: Record<string, any> = {};
  try {
    saved = JSON.parse(await getSetting(SETTING, "{}")) || {};
  } catch (_) {
    saved = {};
  }
  const flag = (v: any): boolean | null => (v === null || v === undefined || v === "" ? null : v === true || v === "true" || v === 1 || v === "1");
  const pct = (v: any): number | null => {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(String(v).replace(",", "."));
    if (!Number.isFinite(n) || n < 0 || n > 100) throw new Error("percent");
    return Math.round(n * 100) / 100;
  };
  const txt = (v: any, n: number): string | null => String(v ?? "").trim().slice(0, n) || null;
  saved[id] = {
    mecImpacted: flag(input.mecImpacted),
    percentualPresencial: pct(input.percentualPresencial),
    percentualSincrono: pct(input.percentualSincrono),
    teoriaAoVivo: flag(input.teoriaAoVivo),
    praticaPresencial: flag(input.praticaPresencial),
    cronogramaPraticasDefinido: flag(input.cronogramaPraticasDefinido),
    transitionNote: txt(input.transitionNote, 2000),
    commercialApprovedText: txt(input.commercialApprovedText, 2000)
  };
  await setSetting(SETTING, JSON.stringify(saved));
  return (await getAreas()).find(a => a.id === id) as AreaRule;
};

// ------------------------------------------------------------------ which area a course belongs to
const degreeMap = async (): Promise<Map<string, string>> => {
  const grades = await CommercialGrade.findAll({ attributes: ["courseName", "degree", "curriculumTerm"], order: [["curriculumTerm", "DESC"]] });
  const map = new Map<string, string>();
  grades.forEach(g => {
    const key = plain(g.courseName).replace(/\s*\(.*\)\s*$/, "");
    if (g.degree && !map.has(key)) map.set(key, g.degree);
  });
  return map;
};

const valuesOf = (a: AreaRule) => ({
  mecImpacted: a.mecImpacted,
  regulation: a.article,
  percentualPresencial: a.percentualPresencial,
  percentualSincrono: a.percentualSincrono,
  teoriaAoVivo: a.teoriaAoVivo,
  praticaPresencial: a.praticaPresencial,
  cronogramaPraticasDefinido: a.cronogramaPraticasDefinido,
  transitionStatus: a.transitionStatus,
  currentDelivery: a.currentDelivery,
  futureDelivery: a.futureDelivery,
  transitionNote: a.transitionNote,
  commercialApprovedText: a.commercialApprovedText
});

export interface CourseArea {
  id: number;
  name: string;
  area: AreaId;
  hasRule: boolean;
}

// the area of one course (the degree comes from its commercial grade)
export const areaOfCourse = async (course: { name: string; modality?: string | null }): Promise<AreaId> => {
  const degrees = await degreeMap();
  return areaOf(course.name, degrees.get(plain(course.name)) || null, course.modality || null);
};

export const classifyCourses = async (): Promise<CourseArea[]> => {
  const [courses, degrees, rules] = await Promise.all([
    Course.findAll({ where: { active: true } as any, attributes: ["id", "name", "modality"], order: [["name", "ASC"]] }),
    degreeMap(),
    CourseRegulation.findAll({ attributes: ["courseId", "intakeTerm"] })
  ]);
  const withRule = new Set(rules.filter(r => !r.intakeTerm).map(r => r.courseId));
  return courses.map(c => ({ id: c.id, name: c.name, area: areaOf(c.name, degrees.get(plain(c.name)) || null, c.modality), hasRule: withRule.has(c.id) }));
};

// Fills the rule of the courses: only the ones without a rule, or every course of the area (`overwrite`: the team changed the area and wants
// it applied to all). A rule of a single intake period is never touched.
export const applyDefaults = async (opts: { area?: string; overwrite?: boolean } = {}): Promise<{ created: number; updated: number; skipped: number }> => {
  const areas = await getAreas();
  const list = await classifyCourses();
  let created = 0;
  let updated = 0;
  let skipped = 0;
  for (const c of list) {
    if (opts.area && c.area !== opts.area) continue;
    const rule = areas.find(a => a.id === c.area);
    if (!rule) continue;
    // eslint-disable-next-line no-await-in-loop
    const existing = await CourseRegulation.findOne({ where: { courseId: c.id, intakeTerm: null as any } });
    if (existing && !opts.overwrite) {
      skipped += 1;
      continue;
    }
    if (existing) {
      // eslint-disable-next-line no-await-in-loop
      await existing.update(valuesOf(rule) as any);
      updated += 1;
    } else {
      // eslint-disable-next-line no-await-in-loop
      await CourseRegulation.create({ courseId: c.id, intakeTerm: null, ...valuesOf(rule) } as any);
      created += 1;
    }
  }
  return { created, updated, skipped };
};

// ------------------------------------------------------------------ the same information in the knowledge base of the commercial agents
export const syncMecKnowledge = async (): Promise<number> => {
  const flows = await ChatFlow.findAll({ where: { kind: "agent" } as any, attributes: ["agentId", "draft"] });
  const agents = [...new Set(flows.filter(f => f.agentId && /"hooks":\s*\[\s*"commercial"/.test(String(f.draft || ""))).map(f => f.agentId as number))];
  let added = 0;
  for (const agentId of agents) {
    // eslint-disable-next-line no-await-in-loop
    const has = await KbDocument.findOne({ where: { agentId, title: MEC_DOC_TITLE } as any, attributes: ["id"] });
    if (has) continue;
    // eslint-disable-next-line no-await-in-loop
    await addDocument({ ...MEC_DOC, kind: "doc", source: "texto", agentId } as any);
    added += 1;
  }
  return added;
};

// once per version at boot: courses without a rule get the standard of their area and the commercial agents learn the Portaria
export const seedMecDefaults = async (attempt = 0): Promise<void> => {
  try {
    if ((await getSetting(SEEN, "")) === VERSION) return;
    // the catalogue of courses may still be loading at the first start: try again a few times
    if (!(await Course.count())) {
      if (attempt < 10) setTimeout(() => void seedMecDefaults(attempt + 1), 30000).unref?.();
      return;
    }
    const r = await applyDefaults({ overwrite: false });
    const docs = await syncMecKnowledge();
    await setSetting(SEEN, VERSION);
    logger.info(`MEC standard applied: ${r.created} rules created, ${r.skipped} kept; ${docs} agent(s) learned the Portaria`);
  } catch (err) {
    logger.warn(`MEC standard failed: ${err}`);
  }
};
