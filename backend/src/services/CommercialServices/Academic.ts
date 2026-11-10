import fs from "fs";
import path from "path";
import { Op } from "sequelize";

import { gradePath } from "../../analysis/Grades";
import { chooseGrade, gradeCaption, internshipPitch } from "./GradeChoice";
import { createCurricular } from "../../analysis/Store";
import { PUBLIC_DIR } from "../../config/paths";
import CommercialGrade from "../../models/CommercialGrade";
import Course from "../../models/Course";
import CourseRegulation from "../../models/CourseRegulation";
import CourseCohort from "../../models/CourseCohort";
import RegulatoryNorm from "../../models/RegulatoryNorm";
import CurricularAnalysis from "../../models/CurricularAnalysis";
import Lead from "../../models/Lead";
import LeadReminderLog from "../../models/LeadReminderLog";
import LeadTask from "../../models/LeadTask";
import { dayBounds } from "../../helpers/AppTime";
import { syncNextFollowUp } from "../CrmServices/FollowUp";
import { whenText } from "./Hours";
import Message from "../../models/Message";
import Polo from "../../models/Polo";
import Ticket from "../../models/Ticket";
import User from "../../models/User";
import { isPg } from "../../helpers/sqlDialect";
import { logger } from "../../utils/logger";
import { getEntryTerms } from "../CrmServices/LeadCore";
import SendWhatsAppMedia from "../WbotServices/SendWhatsAppMedia";
import SendWhatsAppMessage from "../WbotServices/SendWhatsAppMessage";
import { searchChunks } from "../AiServices/Kb";
import { resolvePoloFor } from "../PoloServices/ResolvePolo";
import { cleanPatch, Slots } from "./Slots";
import { areaOfCourse } from "./MecDefaults";
import { explainCourse } from "./MecKnowledge";
import { cohortFor } from "./Norms";
import { topicsOf } from "./Rules";

// The academic data the commercial agent may state, read from the system and returned in the smallest shape that is enough to answer.
// Nothing here returns a price or a scholarship. What the system does not have comes back as "unknown", never as a guess.
export interface AcademicCtx {
  ticket: Ticket | null;
  // the simulator reads, but never sends or writes
  dryRun: boolean;
  slots: Slots;
  // what the tools found, to become slots
  patch: Slots;
  cacheHits: number;
  agentId?: number | null;
}

export const ACADEMIC_TOOLS = [
  "buscar_curso", "buscar_regra_modalidade", "buscar_grade", "buscar_estagio", "listar_polos", "consultar_conhecimento", "enviar_material",
  "iniciar_analise_curricular", "consultar_analise_curricular", "agendar_contato"
] as const;

// ---------------------------------------------------------------- small cache (a new version of the data invalidates it by itself)
const memo = new Map<string, { stamp: string; value: any }>();
const stampOf = async (): Promise<string> => {
  const [c, g, r, k, n] = await Promise.all([Course.max("updatedAt"), CommercialGrade.max("updatedAt"), CourseRegulation.max("updatedAt"), CourseCohort.max("updatedAt"), RegulatoryNorm.max("updatedAt")]);
  return [c, g, r, k, n].map(d => (d ? new Date(d as any).getTime() : 0)).join("-");
};
const cached = async <T>(ctx: AcademicCtx, key: string, fn: () => Promise<T>): Promise<T> => {
  const stamp = await stampOf();
  const hit = memo.get(key);
  if (hit && hit.stamp === stamp) {
    ctx.cacheHits += 1;
    return hit.value as T;
  }
  const value = await fn();
  memo.set(key, { stamp, value });
  if (memo.size > 500) memo.delete(memo.keys().next().value as string);
  return value;
};
export const clearAcademicCache = (): void => memo.clear();

// The courses the institution offers: the active ones of the catalogue of the system. The agent talks about these and only these.
export interface OfferedCourse { id: number; name: string; level: string | null; modality: string | null }
export const offeredCourses = async (): Promise<OfferedCourse[]> => {
  const stamp = await stampOf();
  const hit = memo.get("offered");
  if (hit && hit.stamp === stamp) return hit.value as OfferedCourse[];
  const rows = await Course.findAll({ where: { active: true } as any, attributes: ["id", "name", "level", "modality"], order: [["name", "ASC"]], limit: 300 });
  const value = rows.map(c => ({ id: c.id, name: String(c.name || "").trim(), level: c.level || null, modality: c.modality || null })).filter(c => c.name);
  memo.set("offered", { stamp, value });
  return value;
};

const words = (s: string): string[] => plain(s).split(" ").filter(w => w.length >= 4);

// the offered courses that look the most like a name that is not offered (a shared word first), then the others, a few only
export const closestOffered = (list: OfferedCourse[], wanted: string, limit = 6): OfferedCourse[] => {
  // one per family ("Administração", "Administração Pública" count once), so a long catalogue is not read from "A" only
  const seen = new Set<string>();
  const unique = list.filter(c => { const k = words(c.name)[0] || c.name; if (seen.has(k)) return false; seen.add(k); return true; });
  const w = new Set(words(wanted));
  const shared = unique.filter(c => words(c.name).some(x => w.has(x)));
  const rest = unique.filter(c => !shared.includes(c));
  const room = Math.max(0, limit - shared.length);
  const step = rest.length > room && room ? rest.length / room : 1;
  const spread = room ? Array.from({ length: Math.min(room, rest.length) }, (_, i) => rest[Math.floor(i * step)]) : [];
  return [...shared, ...spread].slice(0, limit);
};

// "A, B e C"
export const joinNames = (names: string[]): string => (names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}`);

const plain = (s: string): string =>
  String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

const modalityOf = (m: string | null | undefined): string | null => {
  const p = plain(m || "");
  if (!p) return null;
  if (p.includes("SEMI")) return "SEMIPRESENCIAL";
  if (p.includes("EAD") || p.includes("DISTANCIA")) return "EAD";
  if (p.includes("PRESENCIAL")) return "PRESENCIAL";
  return p;
};

// "2026/2" and "2026.2" are the same period; the grades use the dotted one
const termOf = (v: any): string | null => {
  const m = String(v || "").match(/(20\d{2})\s*[./-]\s*([12])/);
  return m ? `${m[1]}.${m[2]}` : null;
};
const termNumber = (t: string | null | undefined): number => {
  const x = termOf(t);
  return x ? Number(x.replace(".", "")) : 0;
};

// ---------------------------------------------------------------- courses
const distanceOf = (a: string, b: string): number => {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j += 1) dp[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) for (let j = 1; j <= b.length; j += 1) dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
};

// "medicina" is not inside "biomedicina": a name has to start a word of the course
const startsAWord = (n: string, want: string): boolean => (` ${n}`).includes(` ${want}`);

// "administracao", "enfermagen", "pedagogia ead": the database search is accent- and typo-sensitive, this one is not
const fuzzyCourse = async (name: string): Promise<Course | null> => {
  const want = plain(name);
  if (want.length < 4) return null;
  const all = await Course.findAll({ where: { active: true } as any, attributes: ["id", "name", "modality", "level", "semesters", "monthlyFee", "active"] });
  const scored = all
    .map(c => {
      const n = plain(c.name);
      const d = distanceOf(want, n);
      const tolerance = Math.max(1, Math.round(n.length / 6));
      const score = n === want ? 100 : n.startsWith(want) || want.startsWith(n) ? 70 : startsAWord(n, want) || want.includes(n) ? 55 : d <= tolerance ? 40 - d : 0;
      return { c, score };
    })
    .filter(x => x.score > 0)
    .sort((x, y) => y.score - x.score);
  return scored.length ? scored[0].c : null;
};

export const findCourse = async (input: { courseId?: any; courseName?: any; offerId?: any }, modality?: string | null): Promise<Course | null> => {
  const id = Number(input.offerId || input.courseId) || 0;
  if (id) {
    const byId = await Course.findByPk(id);
    if (byId) return byId;
  }
  const name = String(input.courseName || "").trim();
  if (!name) return null;
  const like = isPg() ? { [Op.iLike]: `%${name.replace(/[%_]/g, "")}%` } : { [Op.like]: `%${name.replace(/[%_]/g, "")}%` };
  const want = plain(name);
  const found = (await Course.findAll({ where: { active: true, name: like } as any, limit: 12 })).filter(c => startsAWord(plain(c.name), want));
  if (!found.length) return fuzzyCourse(name);
  const wantMod = modalityOf(modality);
  const score = (c: Course): number => {
    const n = plain(c.name);
    return (n === want ? 100 : n.startsWith(want) ? 60 : 20) + (wantMod && modalityOf(c.modality) === wantMod ? 15 : 0) - Math.min(n.length, 80) / 10;
  };
  return found.sort((a, b) => score(b) - score(a))[0];
};

const intakeOf = async (ctx: AcademicCtx, given?: any): Promise<string | null> => {
  const t = termOf(given) || termOf(ctx.slots.intakePeriod);
  if (t) return t;
  return termOf((await getEntryTerms()).defaultTerm);
};

// the grade of the course for the intake period: the most recent one that is already in effect at the intake, never "the first one found"
export const pickGrade = async (course: Course, intake: string | null): Promise<{ grade: CommercialGrade | null; current: boolean }> => {
  const all = await CommercialGrade.findAll({ where: { courseName: { [Op.ne]: "" } } as any });
  return chooseGrade(all, course, intake);
};

const regulationOf = async (course: Course, intake: string | null): Promise<CourseRegulation | null> => {
  const rows = await CourseRegulation.findAll({ where: { courseId: course.id } });
  const slash = intake ? intake.replace(".", "/") : null;
  return rows.find(r => slash && (r.intakeTerm === slash || r.intakeTerm === intake)) || rows.find(r => !r.intakeTerm) || null;
};

const internshipsOf = (g: CommercialGrade | null): Array<{ semester: number; discipline: string; hours: number | null }> =>
  String(g?.internshipInfo || "")
    .split("\n")
    .map(line => line.replace(/^\s*[-•]\s*/, "").match(/^(\d+)\s*[ºo°]?\s*sem\.?:\s*(.+?)(?:\s*\((\d+)\s*h\))?\s*$/i))
    .filter((m): m is RegExpMatchArray => !!m)
    .map(m => ({ semester: Number(m[1]), discipline: m[2].trim(), hours: m[3] ? Number(m[3]) : null }));

const semestersText = (n: number | null | undefined): string | null => (n ? `${n} semestres (${n % 2 === 0 ? `${n / 2} anos` : `${Math.round((n / 2) * 10) / 10} anos`})` : null);

const notFound = { encontrado: false, aviso: "Esse curso NÃO está no catálogo: a instituição não o oferece. Diga isso com clareza, sem falar de valor, duração ou grade dele, e ofereça os cursos que oferecemos (use as opções ou a lista do prompt)." };

// a name given to the tool wins over the course saved in the slots ("e Enfermagem, quanto dura?" is about Enfermagem)
const courseOf = async (ctx: AcademicCtx, input: any): Promise<Course | null> => {
  const named = String(input.courseName ?? input.nome ?? "").trim();
  const explicitId = Number(input.courseId ?? input.offerId) || 0;
  if (named && !explicitId) return findCourse({ courseName: named }, input.modalidade || ctx.slots.courseModality);
  return findCourse({ courseId: input.courseId ?? ctx.slots.courseId, courseName: ctx.slots.courseName, offerId: input.offerId ?? ctx.slots.offerId }, input.modalidade || ctx.slots.courseModality);
};

const remember = (ctx: AcademicCtx, patch: Slots): void => {
  ctx.patch = { ...ctx.patch, ...cleanPatch(patch) };
  ctx.slots = { ...ctx.slots, ...cleanPatch(patch) };
};

// ---------------------------------------------------------------- the tools
export const runAcademicTool = async (name: string, input: any, ctx: AcademicCtx): Promise<any> => {
  input = input || {};
  switch (name) {
    case "buscar_curso": {
      const course = await courseOf(ctx, input);
      if (!course) return { ...notFound, opcoes: closestOffered(await offeredCourses(), String(input.courseName ?? input.nome ?? ""), 6).map(c => c.name) };
      const intake = await intakeOf(ctx, input.intakePeriod);
      const view = await cached(ctx, `curso:${course.id}:${intake}`, async () => {
        const { grade } = await pickGrade(course, intake);
        const reg = await regulationOf(course, intake);
        const semesters = grade?.durationSemesters || course.semesters || null;
        return {
          id: course.id,
          nome: course.name,
          grau: grade?.degree || course.level || null,
          duracaoSemestres: semesters,
          duracaoTexto: semestersText(semesters),
          modalidade: modalityOf(course.modality),
          area: grade?.knowledgeArea || null,
          mecImpactado: reg && reg.mecImpacted !== null && reg.mecImpacted !== undefined ? reg.mecImpacted : null,
          gradeAtualId: grade ? grade.id : null,
          temEstagio: grade ? (grade.totalInternshipHours || 0) > 0 : null,
          temTcc: grade ? !!grade.hasTcc : null,
          modalidadeAviso: "Se a pessoa perguntar se o curso é online, EaD, semipresencial ou presencial, ou como funcionam as aulas, chame buscar_regra_modalidade e explique em até 3 frases (regra nacional, o que a instituição confirmou e o que ainda não foi divulgado). Nunca responda só com a modalidade."
        };
      });
      remember(ctx, {
        courseId: view.id, offerId: view.id, courseName: view.nome, courseDegree: view.grau, courseDurationSemesters: view.duracaoSemestres, courseDurationText: view.duracaoTexto,
        courseModality: view.modalidade, mecImpacted: view.mecImpactado, gradeId: view.gradeAtualId, hasInternship: view.temEstagio, hasTcc: view.temTcc, intakePeriod: intake
      });
      return view;
    }

    case "buscar_regra_modalidade": {
      const course = await courseOf(ctx, input);
      if (!course) return notFound;
      const intake = await intakeOf(ctx, input.intakePeriod);
      const poloId = Number(ctx.slots.poloId) || null;
      const view = await cached(ctx, `regra:${course.id}:${intake}:${poloId || ""}`, async () => {
        const r = await regulationOf(course, intake);
        const area = await areaOfCourse(course);
        const cohort = await cohortFor(course.id, intake, poloId);
        const num = (v: any) => (v === null || v === undefined ? null : Number(v));
        const explicacao = explainCourse({
          area,
          catalogModality: modalityOf(course.modality),
          rule: r ? {
            mecImpacted: r.mecImpacted ?? null, percentualPresencial: num(r.percentualPresencial), percentualSincrono: num(r.percentualSincrono), teoriaAoVivo: r.teoriaAoVivo ?? null,
            praticaPresencial: r.praticaPresencial ?? null, cronogramaPraticasDefinido: r.cronogramaPraticasDefinido ?? null, transitionStatus: r.transitionStatus || null,
            currentDelivery: r.currentDelivery || null, futureDelivery: r.futureDelivery || null, transitionNote: r.transitionNote || null, commercialApprovedText: r.commercialApprovedText || null
          } : null,
          cohort
        });
        // a norm that was amended (or never checked against the official source) is said so, so the agent does not quote it as settled
        const norms = await RegulatoryNorm.findAll({ attributes: ["number", "status", "reviewedAt"] });
        const aviso = norms.filter(n => n.status !== "vigente").map(n => `${n.number}: situação ${n.status}. Afirme só o que está confirmado e diga que o consultor confirma o restante.`);
        if (!r) {
          return {
            modalidadeAtual: modalityOf(course.modality), regulacaoAplicavel: null, mecImpactado: null, percentualPresencial: null, percentualSincrono: null, teoriaAoVivo: null,
            praticaPresencial: null, cronogramaPraticasDefinido: null, transitionStatus: null, currentDeliveryDuringTransition: null, futureDelivery: null, transitionNote: null,
            commercialApprovedText: null, explicacao, normasComAlteracao: aviso,
            aviso: "Não há regra institucional cadastrada para este curso: use só a regra nacional de explicacao.nacional e diga que o consultor confirma como o curso funciona na prática."
          };
        }
        return {
          modalidadeAtual: modalityOf(r.currentDelivery) || modalityOf(course.modality), regulacaoAplicavel: r.regulation || null, mecImpactado: r.mecImpacted ?? null,
          percentualPresencial: num(r.percentualPresencial), percentualSincrono: num(r.percentualSincrono), teoriaAoVivo: r.teoriaAoVivo ?? null, praticaPresencial: r.praticaPresencial ?? null,
          cronogramaPraticasDefinido: r.cronogramaPraticasDefinido ?? null, transitionStatus: r.transitionStatus || null, currentDeliveryDuringTransition: r.currentDelivery || null,
          futureDelivery: r.futureDelivery || null, transitionNote: r.transitionNote || null, commercialApprovedText: r.commercialApprovedText || null, explicacao, normasComAlteracao: aviso
        };
      });
      remember(ctx, { courseId: course.id, courseName: course.name, mecImpacted: view.mecImpactado, courseModality: view.modalidadeAtual });
      return view;
    }

    case "buscar_grade": {
      const course = await courseOf(ctx, input);
      if (!course) return notFound;
      const intake = await intakeOf(ctx, input.intakePeriod);
      const view = await cached(ctx, `grade:${course.id}:${intake}`, async () => {
        const { grade, current } = await pickGrade(course, intake);
        if (!grade) return { encontrada: false, aviso: "Não há grade cadastrada para este curso e período. Diga que vai encaminhar a grade pela equipe." };
        const stages = internshipsOf(grade);
        return {
          gradeId: grade.id, courseId: course.id, version: grade.curriculumTerm, effectiveFrom: grade.curriculumTerm, effectiveTo: null, intakePeriod: intake, current,
          fileId: grade.id, legendaDoPdf: "A legenda do PDF já lista o estágio supervisionado.", duration: semestersText(grade.durationSemesters), workload: grade.totalCourseHours ? `${grade.totalCourseHours}h` : null,
          semesters: [], internships: stages, tcc: grade.hasTcc ? { exists: true } : null, temArquivo: fs.existsSync(gradePath(grade))
        };
      });
      if (view.gradeId) remember(ctx, { gradeId: view.gradeId, gradeVersion: view.version, hasTcc: !!view.tcc, hasInternship: (view.internships || []).length > 0, gradeAsked: true });
      return view;
    }

    case "buscar_estagio": {
      const course = await courseOf(ctx, input);
      if (!course) return notFound;
      const intake = await intakeOf(ctx, input.intakePeriod);
      const view = await cached(ctx, `estagio:${course.id}:${intake}:${input.gradeId || ""}`, async () => {
        const grade = input.gradeId ? await CommercialGrade.findByPk(Number(input.gradeId)) : (await pickGrade(course, intake)).grade;
        if (!grade) return { encontrado: false, aviso: "Sem grade cadastrada: não afirme nada sobre estágio. Diga que vai confirmar." };
        const stages = internshipsOf(grade);
        return { mandatory: (grade.totalInternshipHours || 0) > 0 || stages.length > 0, totalHours: grade.totalInternshipHours || stages.reduce((t, s) => t + (s.hours || 0), 0) || 0, stages };
      });
      if ((view as any).totalHours !== undefined) {
        const first = (view.stages || [])[0];
        remember(ctx, { hasInternship: !!view.mandatory, internshipSummary: view.mandatory ? `${view.totalHours}h${first ? `, a partir do ${first.semester}º semestre` : ""}` : "sem estágio obrigatório na matriz" });
      }
      return view;
    }

    case "listar_polos": {
      const city = String(input.cidade || ctx.slots.city || "").trim();
      const stateText = String(input.estado || ctx.slots.state || "").trim();
      const all = await Polo.findAll({ where: { active: true }, order: [["name", "ASC"]], attributes: ["id", "name", "city", "state"] });
      // the cities each polo serves, ignoring accents, punctuation and small typos ("moro em ji parana", "Porto Velho - RO"); a state alone
      // points to the polos of that state
      const r = city || stateText ? await resolvePoloFor(city, stateText) : null;
      const list = (xs: Array<{ id: number; name: string; city: string | null; state: string | null }>) => xs.map(p => ({ id: p.id, nome: p.name, cidade: p.city, estado: p.state }));
      if (r && r.status === "found" && r.polo) {
        // the polo is the lead's; the city stays as the lead said it (a town near the polo is not the polo's city)
        remember(ctx, { poloId: r.polo.id, poloName: r.polo.name, poloStatus: "found", ...(r.state ? { state: r.state } : {}), ...(!ctx.slots.city && city ? { city } : {}) });
        return { polos: list([r.polo]), polo_definido: true, aviso: "Polo definido: confirme à pessoa que ela é atendida por este polo e siga a conversa." };
      }
      if (r && r.status === "ambiguous") {
        remember(ctx, { poloStatus: "ambiguous", ...(r.state ? { state: r.state } : {}) });
        return { polos: list(r.candidates), polo_definido: false, aviso: "Mais de um polo serve. Pergunte em UMA frase qual destes é o mais perto da pessoa (cite só estes nomes) e chame esta ferramenta de novo com a resposta." };
      }
      if (r && (city || stateText)) {
        remember(ctx, { poloStatus: "none", ...(r.state ? { state: r.state } : {}) });
        const askState = !ctx.slots.state && !r.state;
        return {
          polos: list(all),
          polo_definido: false,
          aviso: askState
            ? "Nenhum polo cobre essa cidade. Pergunte em UMA frase em qual estado a pessoa mora e chame esta ferramenta de novo com o estado. Não invente polo."
            : "Nenhum polo atende essa região. Diga com naturalidade que a equipe central acompanha o atendimento (ensino a distância e retorno por consultor) e continue a qualificação. Não invente polo nem cidade."
        };
      }
      return { polos: list(all), polo_definido: false, aviso: "Peça a cidade (e o estado, se precisar) para achar o polo certo." };
    }

    case "agendar_contato": {
      // the day and the hour the person gave: the consultant of the polo gets a task for that moment (the lead is not told a time nobody keeps)
      const ymd = String(input.dia || "").match(/^(\d{4}-\d{2}-\d{2})/)?.[1];
      if (!ymd) return { erro: "Informe o dia no formato AAAA-MM-DD." };
      const word = String(input.horario || "").toLowerCase();
      const hhmm = word.match(/^(\d{1,2})[:h](\d{2})?/);
      const minutes = hhmm ? Math.min(23, Number(hhmm[1])) * 60 + Number(hhmm[2] || 0) : /manh/.test(word) ? 9 * 60 : /tarde/.test(word) ? 14 * 60 : /noite/.test(word) ? 19 * 60 : 9 * 60;
      const at = new Date(dayBounds(ymd).start.getTime() + minutes * 60000);
      const now = Date.now();
      if (Number.isNaN(at.getTime()) || at.getTime() < now + 30 * 60000) return { erro: "Esse horário já passou ou está muito perto: peça outro dia ou horário." };
      if (at.getTime() > now + 30 * 86400000) return { erro: "Só combino retornos dentro de 30 dias." };
      const quando = `${whenText(at)}`;
      remember(ctx, { bestTime: `${ymd} ${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}` });
      if (!ctx.dryRun && ctx.ticket) {
        const lead = await Lead.findOne({ where: { contactId: ctx.ticket.contactId } });
        if (lead) {
          const key = `callback:${ymd}`;
          if (!(await LeadReminderLog.findOne({ where: { leadId: lead.id, key } }))) {
            await LeadReminderLog.create({ leadId: lead.id, key } as any);
            await LeadTask.create({ leadId: lead.id, userId: lead.ownerId || null, type: "ligar", title: `Retornar ao lead no horário combinado (${quando})${input.observacao ? `: ${String(input.observacao).slice(0, 80)}` : ""}`, dueAt: at } as any);
            await syncNextFollowUp(lead.id);
          }
        }
      }
      return { agendado: true, quando, texto_confirmacao: `Combinado! O consultor do seu polo entra em contato ${quando}. Se precisar mudar, é só me avisar por aqui. 😊`, aviso: "Confirme com o texto_confirmacao; não prometa outro horário." };
    }

    case "consultar_conhecimento": {
      const question = String(input.pergunta || input.assunto || "");
      const topics = [...new Set([...(input.assunto ? topicsOf(String(input.assunto)) : []), ...topicsOf(question)])];
      const hits = await searchChunks(ctx.agentId || 0, question, 3, { topics, courseId: Number(ctx.slots.courseId) || null });
      if (!hits.length) return { encontrado: false, aviso: "A base aprovada não tem isso. Não invente: diga que vai confirmar e registre a dúvida." };
      return { encontrado: true, trechos: hits.map(h => ({ titulo: h.title, texto: h.content.slice(0, 700) })), aviso: "Use só o que está nos trechos." };
    }

    case "enviar_material": {
      const grade = await CommercialGrade.findByPk(Number(input.gradeId || ctx.slots.gradeId) || 0);
      if (!grade) return { enviado: false, erro: "Grade não encontrada. Use buscar_grade antes." };
      if (ctx.dryRun || !ctx.ticket) {
        remember(ctx, { gradeSent: true, gradeId: grade.id, gradeVersion: grade.curriculumTerm, gradeAsked: true });
        return { enviado: false, simulado: true, aviso: "No teste o arquivo não é enviado. Diga que está encaminhando a grade." };
      }
      const source = gradePath(grade);
      const caption = gradeCaption(grade, internshipsOf(grade));
      if (!fs.existsSync(source)) {
        // the file is not on the server: the summary of the matrix (with the internships) still goes, in writing
        if (caption) {
          try {
            await SendWhatsAppMessage({ body: caption, ticket: ctx.ticket, automated: true });
            remember(ctx, { gradeSent: true, gradeId: grade.id, gradeVersion: grade.curriculumTerm, gradeAsked: true });
            return { enviado: true, texto_estagio_tutoria: internshipPitch(grade, internshipsOf(grade)), aviso: "O PDF não está disponível agora; mandei o resumo da grade com os estágios em texto. Não comente o envio. Use o texto_estagio_tutoria como está; só se perguntarem do arquivo, diga que a equipe envia o PDF completo em seguida. Não faça pergunta nesta mensagem." };
          } catch (err) {
            logger.warn(`Grade summary not sent: ${(err as Error).message}`);
          }
        }
        return { enviado: false, erro: "O PDF desta grade não está disponível. Diga que a equipe envia." };
      }
      try {
        const copyName = `grade-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.pdf`;
        fs.copyFileSync(source, path.join(PUBLIC_DIR, copyName));
        const display = `${grade.courseName}.pdf`.replace(/[\\/:*?"<>|]/g, "_");
        await SendWhatsAppMedia({
          media: { filename: copyName, originalname: display, mimetype: "application/pdf", path: path.join(PUBLIC_DIR, copyName) } as Express.Multer.File,
          ticket: ctx.ticket,
          body: caption,
          displayName: display,
          automated: true
        } as any);
        remember(ctx, { gradeSent: true, gradeId: grade.id, gradeVersion: grade.curriculumTerm, gradeAsked: true });
        return { enviado: true, texto_estagio_tutoria: internshipPitch(grade, internshipsOf(grade)), aviso: "O PDF foi entregue com os estágios na legenda. NÃO diga que enviou, encaminhou ou anexou a grade (a pessoa já a vê). Escreva apenas o texto_estagio_tutoria, em até 2 blocos curtos, sem repetir a lista da legenda e sem fazer pergunta: o sistema pergunta o que falta em seguida." };
      } catch (err) {
        logger.warn(`Grade not sent: ${(err as Error).message}`);
        return { enviado: false, erro: "Não consegui enviar o arquivo agora. Diga que a equipe envia em seguida." };
      }
    }

    case "iniciar_analise_curricular": return startAnalysis(ctx);
    case "consultar_analise_curricular": return readAnalysis(ctx);
    default: return { erro: "Ferramenta desconhecida." };
  }
};

// ---------------------------------------------------------------- the curricular analysis
const systemUserId = async (lead: Lead | null): Promise<number> => {
  if (lead?.ownerId) return lead.ownerId;
  const admin = await User.findOne({ where: { profile: "admin" }, order: [["id", "ASC"]], attributes: ["id"] });
  return admin ? admin.id : 1;
};

const countOf = (list: any[], status: string): number => list.filter(s => s?.status === status).length;

// what the analysis says, in the words of the slots (the forecast only when the analysis has one)
export const analysisSlots = (row: CurricularAnalysis): Slots => {
  let result: any = null;
  let subjects: any[] = [];
  try { result = JSON.parse(row.result || "null"); } catch (e) { result = null; }
  try { subjects = JSON.parse(row.subjects || "[]"); } catch (e) { subjects = []; }
  const done = row.status === "COMPLETED";
  const sim = result?.simulation;
  const adapt = Number(result?.previousBacklogCount ?? result?.backlogTotal ?? 0);
  return cleanPatch({
    analysisId: row.id,
    analysisStatus: done ? "completed" : "in_progress",
    ...(done
      ? {
          semesterEntry: row.entryPeriod,
          subjectsWaived: result?.totals?.exempted ?? countOf(subjects, "EXEMPTED"),
          subjectsRemaining: (result?.totals?.pending ?? countOf(subjects, "PENDING")) + adapt,
          adaptations: adapt ? `${adapt} disciplinas a adaptar` : "",
          estimatedCompletion: sim?.estimatedCompletionTerm ? `previsão ${String(sim.estimatedCompletionTerm)}` : ""
        }
      : {})
  });
};

const lastTranscript = async (ticket: Ticket): Promise<{ file: string; name: string } | null> => {
  // a PDF is saved with the media type "application": it is found by its extension, not by the type
  const rows = await Message.findAll({ where: { ticketId: ticket.id, fromMe: false, isDeleted: false, mediaUrl: { [Op.like]: "%.pdf" } } as any, order: [["createdAt", "DESC"]], limit: 3 });
  for (const m of rows) {
    const file = String(m.getDataValue("mediaUrl") || "");
    if (file && fs.existsSync(path.join(PUBLIC_DIR, path.basename(file)))) return { file: path.basename(file), name: path.basename(file) };
  }
  return null;
};

const startAnalysis = async (ctx: AcademicCtx): Promise<any> => {
  if (ctx.dryRun || !ctx.ticket) {
    remember(ctx, { hasTranscript: true, analysisStatus: "in_progress" });
    return { iniciada: false, simulado: true, aviso: "No teste a análise não é criada. Explique que a equipe vai analisar o histórico." };
  }
  const lead = await Lead.findOne({ where: { contactId: ctx.ticket.contactId } });
  const file = await lastTranscript(ctx.ticket);
  if (!file) {
    remember(ctx, { analysisStatus: "waiting_document" });
    return { iniciada: false, motivo: "sem_arquivo", aviso: "O lead ainda não enviou o histórico em PDF. Peça o PDF do histórico acadêmico." };
  }
  const existing = lead ? await CurricularAnalysis.findOne({ where: { leadId: lead.id }, order: [["id", "DESC"]] }) : null;
  if (existing && existing.status !== "ERROR" && Date.now() - new Date(existing.createdAt).getTime() < 3 * 86400000) {
    remember(ctx, { hasTranscript: true, ...analysisSlots(existing) });
    return { iniciada: false, jaExiste: true, status: existing.status === "COMPLETED" ? "concluida" : "em_andamento" };
  }
  try {
    const bytes = fs.readFileSync(path.join(PUBLIC_DIR, file.file));
    const row = await createCurricular(await systemUserId(lead), bytes, file.name, { leadId: lead?.id || null, contactId: ctx.ticket.contactId, candidateName: lead?.name || null });
    remember(ctx, { hasTranscript: true, ...analysisSlots(row) });
    return { iniciada: true, status: row.status === "COMPLETED" ? "concluida" : "em_andamento", aviso: "Não prometa aproveitamento: o resultado vem da análise." };
  } catch (err) {
    logger.warn(`Curricular analysis not started: ${(err as Error).message}`);
    remember(ctx, { hasTranscript: true, analysisStatus: "requested" });
    return { iniciada: false, motivo: "falha", aviso: "Não consegui ler o PDF. Diga que a equipe vai analisar o histórico e retorna." };
  }
};

const readAnalysis = async (ctx: AcademicCtx): Promise<any> => {
  const id = Number(ctx.slots.analysisId) || 0;
  const lead = ctx.ticket ? await Lead.findOne({ where: { contactId: ctx.ticket.contactId } }) : null;
  const row = id ? await CurricularAnalysis.findByPk(id) : lead ? await CurricularAnalysis.findOne({ where: { leadId: lead.id }, order: [["id", "DESC"]] }) : null;
  if (!row) return { existe: false, aviso: "Ainda não há análise. Peça o histórico em PDF." };
  const patch = analysisSlots(row);
  remember(ctx, patch);
  if (row.status !== "COMPLETED") return { existe: true, status: "em_andamento", aviso: "A análise ainda não terminou. Diga que está em andamento." };
  return {
    existe: true, status: "concluida", semestreIngresso: patch.semesterEntry ?? null, disciplinasDispensadas: patch.subjectsWaived ?? null, disciplinasRestantes: patch.subjectsRemaining ?? null,
    adaptacoes: patch.adaptations || null, previsaoConclusao: patch.estimatedCompletion || null,
    aviso: "Explique de forma simples. A previsão é só uma estimativa; nunca garanta data de conclusão."
  };
};

// The grade of a course found and sent to the person (the PDF with the internships in its caption), the same way the model would do with its tools,
// but decided by the system. `sent` is true when the file (or its summary in writing) went; `simulated` in the tester; `missing` when the course
// has no grade registered, so the team can be told.
export const sendGradeFor = async (course: Course, ctx: AcademicCtx): Promise<{ sent: boolean; simulated: boolean; missing: boolean; text: string }> => {
  const found = await runAcademicTool("buscar_grade", { courseId: course.id }, ctx);
  if (!found || !found.gradeId) return { sent: false, simulated: false, missing: true, text: "" };
  const out = await runAcademicTool("enviar_material", { gradeId: found.gradeId }, ctx);
  if (out && out.simulado) return { sent: false, simulated: true, missing: false, text: String(out.texto_estagio_tutoria || "").trim() };
  return { sent: !!(out && out.enviado), simulated: false, missing: false, text: String((out && out.texto_estagio_tutoria) || "").trim() };
};
