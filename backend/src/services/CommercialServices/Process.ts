import { Op } from "sequelize";
import CopilotProgress from "../../models/CopilotProgress";
import { configOf } from "../CopilotServices/Settings";
import { completionOf, CopilotConfig } from "../CopilotServices/Policy";
import Lead from "../../models/Lead";
import Message from "../../models/Message";
import Proposal from "../../models/Proposal";
import Ticket from "../../models/Ticket";
import { bolsaDataFrom, bolsaRequestFor } from "./BolsaData";
import { detectFromText } from "./Detect";
import { runAcademicTool, AcademicCtx } from "./Academic";
import { TUTORING_PITCH } from "./GradeChoice";
import { DOUBTS_QUESTION, PRESENT_BRIDGE, QUESTIONS, durationLine, entryAnswer, modalityTextOf } from "./Rules";
import { hydrate, loadState, Slots } from "./Slots";

// THE COPILOT OF THE CONSULTANT. After the agent hands the conversation over, the consultant goes on with the same process the team follows:
// first degree → course → city → format and MEC → grade, tutoring and internship → doubts → full name and CPF → proposal → enrollment.
// The state is read from the conversation itself (what the lead said, what the consultant already sent), so it keeps up after the handover, when the
// state saved by the agent no longer changes. Nothing here writes to the lead or sends anything: it only says where the process is and what to say next.

export type StepKey = "entry" | "course" | "city" | "format" | "grade" | "doubts" | "bolsa" | "proposal" | "enroll";

export interface CopilotStep {
  key: string;
  instruction: string;
  manual: boolean;
  label: string;
  done: boolean;
}

export interface Copilot {
  hasLead: boolean;
  leadId: number | null;
  steps: CopilotStep[];
  current: string | null;
  processVersion: number;
  // the next message, ready to use (what the team says at this step), and what the screen can do for it
  suggestion: { text: string; action: "send_grade" | "proposal" | "enroll" | null } | null;
}

export const STEP_LABEL: Record<StepKey, string> = {
  entry: "Primeira graduação ou já tem faculdade",
  course: "Curso de interesse",
  city: "Cidade e polo",
  format: "Formato e mudanças do MEC explicados",
  grade: "Grade, tutoria e estágio",
  doubts: "Dúvidas esclarecidas",
  bolsa: "Nome completo e CPF para simular a bolsa",
  proposal: "Proposta enviada",
  enroll: "Matrícula confirmada"
};

const plain = (s: string): string => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// what the conversation says, in order: the lead's words fill what is missing; what the consultant sent marks what was already done
export const readConversation = async (ticket: Ticket, slots: Slots, leadCpf: string | null): Promise<{ slots: Slots; asked: Set<StepKey>; proposalSent: boolean }> => {
  const out: Slots = { ...slots };
  const asked = new Set<StepKey>();
  let proposalSent = false;
  const rows = await Message.findAll({ where: { ticketId: ticket.id } as any, order: [["createdAt", "DESC"], ["id", "DESC"]], limit: 300, attributes: ["id", "body", "fromMe", "mediaType", "createdAt"] });
  let lastMine = "";
  for (const m of rows.reverse()) {
    const text = String(m.body || "").replace(/^[‎‏]+/, "");
    if (m.fromMe) {
      lastMine = text;
      const t = plain(text);
      if (/ate aqui voce compreendeu/.test(t)) { out.modalityExplained = true; out.courseExplained = true; }
      if (/matriz curricular|grade do curso|grade curricular/.test(t) || (m.mediaType === "document" && /(?:matriz|grade)[^\n]*\.pdf/.test(t))) out.gradeSent = true;
      if (/alguma duvida|tem algo que eu posso/.test(t)) asked.add("doubts");
      if (/nome completo e cpf|nome completo e o cpf/.test(t)) asked.add("bolsa");
      if (/proposta/.test(t) && /(encaminhando|segue|enviei|anexo|valor de)/.test(t)) proposalSent = true;
      continue;
    }
    if (!text.trim() || /^\[/.test(text)) continue;
    // eslint-disable-next-line no-await-in-loop
    const found = out.courseName && (out.city || out.poloId) ? {} as Record<string, any> : await detectFromText(text).catch(() => ({} as Record<string, any>));
    if (!out.courseName && found.courseName) { out.courseName = found.courseName; if (found.courseId) out.courseId = found.courseId; }
    if (!out.city && !out.poloId && (found.city || found.poloId)) { if (found.city) out.city = found.city; if (found.poloId) out.poloId = found.poloId; }
    if (!out.entryType || out.entryType === "unknown") {
      const kind = entryAnswer(text, lastMine);
      if (kind) out.entryType = kind;
    }
    const given = bolsaDataFrom(text);
    if (given.cpf) out.cpfGiven = true;
    if (given.fullName && given.cpf) out.fullName = given.fullName;
    if (asked.has("bolsa") && given.fullName && !out.fullName) out.fullName = given.fullName;
    // "não tenho dúvidas" after the doubts were asked: they are over
    if (asked.has("doubts") && /\b(nao tenho (mais )?(nenhuma )?duvida|sem duvidas?|pode (prosseguir|continuar|seguir))\b/.test(plain(text))) out.doubtsOver = true;
  }
  if (leadCpf) out.cpfGiven = true;
  return { slots: out, asked, proposalSent };
};

const first = (name: string | null | undefined): string => String(name || "").trim().split(/\s+/)[0] || "";

// the text of the next step, in the words of the team (the same pieces the agent uses)
const textFor = async (key: StepKey, s: Slots, leadName: string): Promise<{ text: string; action: "send_grade" | "proposal" | "enroll" | null } | null> => {
  switch (key) {
    case "entry": return { text: QUESTIONS.entry, action: null };
    case "course": return { text: QUESTIONS.course, action: null };
    case "city": return { text: QUESTIONS.city, action: null };
    case "format": {
      try {
        const ctx: AcademicCtx = { ticket: null, dryRun: true, slots: { ...s }, patch: {}, cacheHits: 0, agentId: null };
        const arg = { courseId: s.courseId || undefined, courseName: s.courseName || undefined };
        const view = await runAcademicTool("buscar_regra_modalidade", arg, ctx);
        const course = await runAcademicTool("buscar_curso", arg, ctx);
        const name = String((course && course.nome) || s.courseName || "o curso");
        const body = view && !view.erro && view.explicacao ? modalityTextOf(name, view) : null;
        if (body) return { text: [PRESENT_BRIDGE, course && course.nome ? durationLine(String(course.nome), course.duracaoSemestres) : null, body].filter(Boolean).join("\n\n"), action: null };
      } catch (err) {
        // without the rule of the course the consultant explains it
      }
      return { text: "Vou te explicar como ficaram as mudanças do MEC e como funciona o formato do curso. Até aqui você compreendeu?", action: null };
    }
    case "grade":
      return { text: `Vou te enviar a *grade do curso* para você visualizar melhor as disciplinas e a estrutura da formação.\n\n${TUTORING_PITCH}`, action: "send_grade" };
    case "doubts": return { text: DOUBTS_QUESTION, action: null };
    case "bolsa": return { text: `Caso não tenha, ${bolsaRequestFor({ name: !s.fullName, cpf: !s.cpfGiven }).replace(/^./, c => c.toLowerCase())}`, action: null };
    case "proposal": {
      const name = first(s.fullName || leadName);
      return { text: `${name ? `${name}, c` : "C"}onforme combinamos, estou te encaminhando a proposta da sua bolsa${s.courseName ? ` para o curso de *${s.courseName}*` : ""}.`, action: "proposal" };
    }
    case "enroll": return { text: "Se estiver tudo certo para você, me confirma que eu já te passo o próximo passo para realizarmos a matrícula.", action: "enroll" };
    default: return null;
  }
};

export const copilotOf = async (ticket: Ticket, config?: CopilotConfig): Promise<Copilot> => {
  const settings = config || await configOf();
  const lead = ticket.contactId ? await Lead.findOne({ where: { contactId: ticket.contactId }, attributes: ["id", "name", "cpf", "enrolledAt", "courseId", "poloId", "city", "state", "email", "phone", "entryTerm", "admissionType"] }) : null;
  const state = lead ? await hydrate(await loadState(lead.id), lead) : { slots: {} as Slots };
  const { slots, asked, proposalSent } = await readConversation(ticket, state.slots, lead?.cpf || null);
  const progress = await CopilotProgress.findByPk(ticket.id);
  const overrides = progress?.overrides || {};
  const proposals = lead ? await Proposal.count({ where: { leadId: lead.id, sentAt: { [Op.ne]: null } } as any }) : 0;
  const done: Record<StepKey, boolean> = {
    entry: !!slots.entryType && slots.entryType !== "unknown",
    course: !!(slots.courseName || slots.courseId),
    city: !!(slots.city || slots.poloId),
    format: !!(slots.modalityExplained || slots.mecExplained),
    grade: !!slots.gradeSent,
    doubts: !!(slots.doubtsOver || asked.has("bolsa") || (slots.fullName && slots.cpfGiven)),
    bolsa: !!(slots.fullName && slots.cpfGiven),
    proposal: proposals > 0 || proposalSent,
    enroll: !!lead?.enrolledAt
  };
  const steps: CopilotStep[] = settings.steps.map(s => ({ key: s.key, label: s.label, instruction: s.instruction, done: completionOf(s.key, !!done[s.key as StepKey], overrides), manual: Object.prototype.hasOwnProperty.call(overrides, s.key) }));
  const current = steps.find(x => !x.done)?.key || null;
  const configured = settings.steps.find(s => s.key === current);
  const next = current ? (configured?.message ? { text: configured.message, action: null } : await textFor(current as StepKey, slots, lead?.name || "")) : null;
  return { hasLead: !!lead, leadId: lead?.id || null, steps, current, processVersion: settings.version, suggestion: next ? { text: next.text, action: next.action } : null };
};
