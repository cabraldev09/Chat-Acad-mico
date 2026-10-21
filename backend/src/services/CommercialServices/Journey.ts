import type { CommercialPorts } from "./Ports";

// The script the commercial agent follows with every lead, as plain functions of the state of the lead (no model, no database). The model talks; this
// says what is still missing before a person of the polo takes over, so the conversation does not get lost on the way:
//   qualify → present the course → send the grade → (transfer: transcript → analysis) → hand over to the consultant.
// The state lives in the slots of the lead, so a lead that comes back tomorrow goes on from the step it stopped at.
type S = Record<string, any>;

// what stops counting when the person changes the course ("e Enfermagem?"): the explanations and the grade belonged to the old one
export const COURSE_CHANGE_RESET = {
  courseExplained: false, modalityExplained: false, mecExplained: false, internshipExplained: false,
  gradeSent: false, gradeId: null, gradeUnavailable: false, gradeDeclined: false, pendingOffer: null
};

// The grade is settled when the PDF went out, when it cannot go (no matrix or no file: a task asks a person to send it) or when the person said no.
export const gradeResolved = (slots: S): boolean => !!slots.gradeSent || !!slots.gradeUnavailable || !!slots.gradeDeclined;

export type StepKey = "qualify" | "present_course" | "offer_grade" | "answer_offer" | "transcript" | "analysis" | "consultant";

export interface Step {
  key: StepKey;
  // what the model is told to do next (one line)
  instruction: string;
}

const hasCourse = (s: S): boolean => !!(s.courseId || s.courseName);
const hasCity = (s: S): boolean => !!(s.city || s.poloId);
const hasEntry = (s: S): boolean => !!s.entryType && s.entryType !== "unknown";
const needsTranscript = (s: S): boolean => s.entryType === "transfer" || s.entryType === "second_degree";

// The next step the conversation owes the lead, in order. The first three are the data the opening already asks for (the prompt has "Falta descobrir").
export const nextStep = (s: S): Step => {
  if (!hasCourse(s) || !hasCity(s) || !hasEntry(s)) return { key: "qualify", instruction: "descobrir o que falta (curso, cidade e tipo de ingresso), uma pergunta por vez." };
  if (!s.courseExplained) return { key: "present_course", instruction: "apresentar o curso (use buscar_curso)." };
  if (!gradeResolved(s)) {
    if (s.pendingOffer === "grade") return { key: "answer_offer", instruction: "a pessoa ainda não disse se quer a grade; se aceitar (sim, pode, manda), chame buscar_grade e enviar_material." };
    return { key: "offer_grade", instruction: `terminar perguntando se a pessoa quer receber a grade curricular (PDF) de ${s.courseName || "o curso"}.` };
  }
  if (needsTranscript(s) && !s.hasTranscript) return { key: "transcript", instruction: "pedir o histórico acadêmico em PDF para a análise curricular." };
  if (needsTranscript(s) && s.analysisStatus === "completed" && !s.analysisExplained) return { key: "analysis", instruction: "explicar o resultado da análise curricular (consultar_analise_curricular)." };
  return { key: "consultant", instruction: "tirar as dúvidas e conduzir para o consultor do polo." };
};

// The line the prompt carries ("what is mandatory now"); the dynamic part of the prompt is rebuilt every turn from the slots.
export const stepLine = (s: S): string | null => {
  const step = nextStep(s);
  return step.key === "qualify" || step.key === "consultant" ? null : `Próximo passo obrigatório: ${step.instruction}`;
};

// What is still undone before the lead goes to the consultant (for the Central and the summary of the handoff).
export const pendingSteps = (s: S): StepKey[] => {
  const out: StepKey[] = [];
  if (!hasCourse(s) || !hasCity(s) || !hasEntry(s)) out.push("qualify");
  if (hasCourse(s) && !s.courseExplained) out.push("present_course");
  if (hasCourse(s) && !gradeResolved(s)) out.push(s.pendingOffer === "grade" ? "answer_offer" : "offer_grade");
  if (needsTranscript(s) && !s.hasTranscript) out.push("transcript");
  if (needsTranscript(s) && s.analysisStatus === "completed" && !s.analysisExplained) out.push("analysis");
  return out;
};

// ---------------------------------------------------------------- short answers to what the agent offered
const plain = (t: string): string =>
  String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[!.,;:]+/g, " ").replace(/\s+/g, " ").trim();

const YES = /^(sim|s|siim|claro|quero|quero sim|queria|gostaria|pode|pode sim|pode ser|pode mandar|pode enviar|manda|mande|manda ai|manda sim|envia|envie|ok|okay|beleza|blz|por favor|pfv|com certeza|uhum|aham|isso|isso mesmo|quero ver|quero receber|bora|vamos|positivo|fechado|combinado)\b/;
const NO_WORD = /\b(nao|nunca|depois|agora nao|dispenso|sem)\b/;

// "sim", "pode mandar", "quero": the answer to "quer receber a grade?" (only read when an offer is waiting)
export const acceptsOffer = (text: string): boolean => {
  const t = plain(text);
  return !!t && t.length <= 40 && YES.test(t) && !NO_WORD.test(t);
};

export const declinesOffer = (text: string): boolean => {
  const t = plain(text);
  return !!t && t.length <= 40 && /^(nao|n|agora nao|depois|mais tarde|dispenso|nao precisa|nao quero|por enquanto nao|no momento nao)\b/.test(t);
};

// The agent closed its message offering the grade ("Quer que eu te envie a grade curricular?"): the next short "yes" is the answer to that.
export const offersGrade = (text: string): boolean => {
  const body = String(text || "").trim();
  if (!/\?[\s"”')]*$/.test(body)) return false;
  const last = body.split(/(?<=[.!?\n])\s+/).pop() || "";
  return /\b(grade|matriz|curriculo|pdf)\b/.test(plain(last));
};

// ---------------------------------------------------------------- what the system does when the grade could not be delivered

// A grade that failed (no matrix, no file, the send failed) always becomes a task for the consultant, once per course; the milestones feed the Central.
export const gradeFollowUp = async (ports: CommercialPorts, before: S, after: S, now: Date): Promise<void> => {
  if (after.gradeUnavailable && !before.gradeUnavailable) {
    const course = String(after.courseName || "").trim();
    await ports.task(`grade:${after.courseId || course || "x"}`, `Enviar a grade${course ? ` de ${course}` : ""} ao lead (o agente não conseguiu enviar)`, new Date(now.getTime() + 60 * 60000), "documentos");
    await ports.event("grade_failed", { courseId: after.courseId || null, fileMissing: !!after.gradeFileMissing }, false);
  }
  if (after.gradeSent && !before.gradeSent) await ports.event("grade_sent", { courseId: after.courseId || null }, false);
};
