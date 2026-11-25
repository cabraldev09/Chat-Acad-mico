import { institutionName } from "../../helpers/Institution";
import { fmtTime } from "../../helpers/AppTime";
import { Op } from "sequelize";
import CopilotProgress from "../../models/CopilotProgress";
import { configOf } from "../CopilotServices/Settings";
import { completionOf, CopilotConfig } from "../CopilotServices/Policy";
import Lead from "../../models/Lead";
import Message from "../../models/Message";
import Proposal from "../../models/Proposal";
import EnrollmentForm from "../../models/EnrollmentForm";
import Ticket from "../../models/Ticket";
import { bolsaDataFrom, bolsaRequestFor } from "./BolsaData";
import { detectFromText } from "./Detect";
import { runAcademicTool, AcademicCtx, findCourse, pickGrade } from "./Academic";
import { TUTORING_PITCH } from "./GradeChoice";
import { DOUBTS_QUESTION, QUESTIONS, durationLine, entryAnswer, modalityTextOf } from "./Rules";
import { hydrate, loadState, Slots } from "./Slots";

// THE COPILOT OF THE CONSULTANT. After the agent hands the conversation over, the consultant goes on with the same process the team follows:
// first degree → course → city → format and MEC → grade, tutoring and internship → doubts → full name and CPF → proposal → enrollment.
// The state is read from the conversation itself (what the lead said, what the consultant already sent), so it keeps up after the handover, when the
// state saved by the agent no longer changes. Nothing here writes to the lead or sends anything: it only says where the process is and what to say next.

export type StepKey = "entry" | "objective" | "course" | "city" | "format" | "grade" | "doubts" | "bolsa" | "proposal" | "ficha" | "taxa" | "comprovante" | "enroll" | "comunidade" | "afiliado";

export interface CopilotStep {
  key: string;
  instruction: string;
  manual: boolean;
  label: string;
  done: boolean;
  // a step the process does not wait for (the objective of the lead, the referral program)
  optional: boolean;
}

export interface Copilot {
  hasLead: boolean;
  leadId: number | null;
  steps: CopilotStep[];
  current: string | null;
  processVersion: number;
  // what the MEC asks of the course of the lead (the consultant says the same as the agent): "EAD: sem aulas práticas presenciais", "Semipresencial: 40% de prática presencial"
  course: { name: string; formato: string; resumo: string; percentualPresencial: number | null; semPratica: boolean; fonte: string } | null;
  // the next message, ready to use (what the team says at this step), and what the screen can do for it
  // "next": the step was not said yet; "waiting": it was already sent and the lead did not answer (the text is a short reminder, not the same
  // message again); "reply": the lead answered with something else (a question), so the consultant answers it and takes the step up again
  suggestion: { text: string; action: "send_grade" | "proposal" | "enroll" | null; gradeId?: number | null; kind: "next" | "waiting" | "reply"; note: string | null } | null;
  // where the conversation is right now: who spoke last, what the lead said, how long ago
  context: { lastFrom: "lead" | "team" | null; lastLeadText: string | null; leadAsked: boolean; minutesSince: number | null; askedCurrentAt: string | null };
}

export const STEP_LABEL: Record<StepKey, string> = {
  entry: "Já tem graduação? (forma de ingresso)",
  course: "O que procura (curso)",
  city: "Cidade e polo",
  format: "Formato e mudanças do MEC explicados",
  grade: "Grade, tutoria e estágio",
  doubts: "Dúvidas esclarecidas",
  bolsa: "Nome completo e CPF para simular a bolsa",
  proposal: "Proposta enviada",
  objective: "Objetivo com a graduação",
  ficha: "Ficha de matrícula e documentos",
  taxa: "Taxa de matrícula (Pix ou boleto)",
  comprovante: "Comprovante recebido",
  enroll: "Matrícula confirmada",
  comunidade: "Tutoria e Comunidade dos Alunos",
  afiliado: "Programa de afiliados"
};

const plain = (s: string): string => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// what the conversation says, in order: the lead's words fill what is missing; what the consultant sent marks what was already done
export interface ConversationNow { lastFrom: "lead" | "team" | null; lastAt: Date | null; lastLeadText: string | null; lastTeamText: string | null; askedAt: Partial<Record<StepKey, Date>>; leadAfter: Partial<Record<StepKey, boolean>> }
export const readConversation = async (ticket: Ticket, slots: Slots, leadCpf: string | null): Promise<{ slots: Slots; asked: Set<StepKey>; got: Set<StepKey>; proposalSent: boolean; now: ConversationNow }> => {
  const now: ConversationNow = { lastFrom: null, lastAt: null, lastLeadText: null, lastTeamText: null, askedAt: {}, leadAfter: {} };
  // the question of a step was sent (now): the answer of the lead is awaited from this moment
  const sent = (k: StepKey, at: Date) => { now.askedAt[k] = at; now.leadAfter[k] = false; };
  const out: Slots = { ...slots };
  const asked = new Set<StepKey>();
  // what the lead already gave (the documents and data of the form, the proof of payment, the objective)
  const got = new Set<StepKey>();
  let proposalSent = false;
  const rows = await Message.findAll({ where: { ticketId: ticket.id } as any, order: [["createdAt", "DESC"], ["id", "DESC"]], limit: 300, attributes: ["id", "body", "fromMe", "mediaType", "createdAt"] });
  let lastMine = "";
  for (const m of rows.reverse()) {
    const text = String(m.body || "").replace(/^[‎‏]+/, "");
    const at = new Date(m.createdAt as any);
    if (text.trim() || m.mediaType) { now.lastFrom = m.fromMe ? "team" : "lead"; now.lastAt = at; }
    if (m.fromMe) {
      lastMine = text;
      const t = plain(text);
      if (text.trim()) now.lastTeamText = text;
      if (/primeira graduacao|ja tem alguma faculdade/.test(t)) sent("entry", at);
      if (/qual curso|o que voce esta procurando/.test(t)) sent("course", at);
      if (/reside em qual cidade|qual (e )?a sua cidade|mora em qual cidade/.test(t)) sent("city", at);
      if (/ate aqui voce (compreendeu|conseguiu compreender)|ficou claro como funciona/.test(t)) sent("format", at);
      if (/alguma duvida|tem algo que eu posso/.test(t)) sent("doubts", at);
      if (/nome completo e (o )?cpf|falta so o seu (cpf|nome completo)/.test(t)) sent("bolsa", at);
      if (/ficha de matricula|nome completo da mae/.test(t)) sent("ficha", at);
      if (/\b(pix|boleto)\b/.test(t) && /taxa|matricula|copia e cola/.test(t)) sent("taxa", at);
      if (/ate aqui voce compreendeu/.test(t)) { out.modalityExplained = true; out.courseExplained = true; }
      if (/matriz curricular|grade do curso|grade curricular/.test(t) || (m.mediaType === "document" && /(?:matriz|grade)[^\n]*\.pdf/.test(t))) out.gradeSent = true;
      if (/alguma duvida|tem algo que eu posso/.test(t)) asked.add("doubts");
      if (/nome completo e cpf|nome completo e o cpf/.test(t)) asked.add("bolsa");
      // a proposal counts when a document went with it (the PDF); the copilot's own sentence "estou te encaminhando a proposta" alone is not one
      if (/\bproposta\b/.test(t) && (/\.pdf/.test(t) || m.mediaType === "document")) proposalSent = true;
      // the steps after the proposal, as the consultant does them
      if (/\bobjetivo\b|concurso publico|prestar concurso|formacao superior rapida/.test(t) && /\?/.test(text)) asked.add("objective");
      if (/ficha de matricula|nome completo da mae/.test(t)) asked.add("ficha");
      if (/\b(pix|boleto)\b/.test(t) && /taxa|matricula|copia e cola/.test(t)) asked.add("taxa");
      // (the agent also speaks of the tutoring while it presents the course: only the invitation to the community of the students is the step)
      if (/comunidade dos alunos/.test(t)) asked.add("comunidade");
      if (/afiliad|programa de indicac|indicar (um|uma|alguem)/.test(t)) asked.add("afiliado");
      continue;
    }
    if (text.trim() && !/^\[/.test(text)) now.lastLeadText = text;
    (Object.keys(now.askedAt) as StepKey[]).forEach(k => { now.leadAfter[k] = true; });
    // what the lead sends after those steps: documents and photos count (the file is not read here)
    const lead = plain(text);
    const hasFile = m.mediaType === "image" || m.mediaType === "document" || /\.(pdf|jpe?g|png)\b/.test(lead);
    if (asked.has("ficha") && (hasFile || /\b(rg|cnh|nascimento|endereco|cep|nome da mae|mae)\b/.test(lead))) got.add("ficha");
    if (asked.has("taxa") && (hasFile || /\b(pix feito|paguei|pago|comprovante|transferi)\b/.test(lead))) got.add("comprovante");
    if (asked.has("objective") || /\b(concurso|segunda graduacao|formacao rapida|mudar de area|crescer na carreira|promocao|abrir (um )?negocio)\b/.test(lead)) got.add("objective");
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
  return { slots: out, asked, got, proposalSent, now };
};

interface FichaLink { link: string; progress: number }

const first = (name: string | null | undefined): string => String(name || "").trim().split(/\s+/)[0] || "";

// the text of the next step, in the words of the team (the same pieces the agent uses)
const textFor = async (key: StepKey, s: Slots, leadName: string, ficha?: FichaLink | null): Promise<{ text: string; action: "send_grade" | "proposal" | "enroll" | null } | null> => {
  switch (key) {
    case "entry": return { text: QUESTIONS.entry, action: null };
    case "course": return { text: "Me conta: o que você está procurando? Qual curso você tem interesse em fazer?", action: null };
    case "city": return { text: QUESTIONS.city, action: null };
    case "format": {
      try {
        const ctx: AcademicCtx = { ticket: null, dryRun: true, slots: { ...s }, patch: {}, cacheHits: 0, agentId: null };
        const arg = { courseId: s.courseId || undefined, courseName: s.courseName || undefined };
        const view = await runAcademicTool("buscar_regra_modalidade", arg, ctx);
        const course = await runAcademicTool("buscar_curso", arg, ctx);
        const name = String((course && course.nome) || s.courseName || "o curso");
        const body = view && !view.erro && view.explicacao ? modalityTextOf(name, view) : null;
        // short: the duration and the format, ending in the question; one idea per message when it is sent
        if (body) return { text: [course && course.nome ? durationLine(String(course.nome), course.duracaoSemestres) : null, body].filter(Boolean).join("\n\n"), action: null };
      } catch (err) {
        // without the rule of the course the consultant explains it
      }
      return { text: "Vou te explicar como ficaram as mudanças do MEC e como funciona o formato do curso. Até aqui você compreendeu?", action: null };
    }
    case "grade":
      // "Enviar" sends this line and the grade of the course right after it; the tutoring comes in the next step, on its own
      return { text: "Vou te enviar a *grade do curso* para você visualizar melhor as disciplinas e a estrutura da formação.", action: "send_grade" };
    case "doubts": return { text: `${TUTORING_PITCH}\n\n${DOUBTS_QUESTION}`, action: null };
    case "bolsa": return { text: bolsaRequestFor({ name: !s.fullName, cpf: !s.cpfGiven }), action: null };
    case "proposal": {
      const name = first(s.fullName || leadName);
      return { text: `${name ? `${name}, c` : "C"}onforme combinamos, estou te encaminhando a proposta da sua bolsa${s.courseName ? ` para o curso de *${s.courseName}*` : ""}.`, action: "proposal" };
    }
    case "objective": return { text: s.courseName ? `Para eu te orientar certinho e não te indicar nada fora do seu objetivo: você está buscando o curso de *${s.courseName}* pensando em prestar concurso público, em crescer na carreira ou mais para ter uma formação superior e usar profissionalmente?` : "Para eu te orientar certinho e não te indicar nada fora do seu objetivo: você está buscando essa graduação pensando em prestar concurso público ou mais para ter uma formação superior e usar profissionalmente?", action: null };
    case "ficha":
      // the lead fills in the form by the personal link (the picture of the ID by the phone's camera); the list in the text is the fallback
      if (ficha) return { text: `Perfeito! Para dar andamento à matrícula, preencha a sua ficha de matrícula pelo link abaixo. Leva poucos minutos e dá para tirar a foto do RG ou da CNH pelo próprio celular.\n\n${ficha.link}\n\nO que você preencher fica salvo, então dá para continuar depois.`, action: null };
      return { text: "Perfeito! Para dar andamento à matrícula, preciso da foto do seu RG ou CNH (frente e verso) e que você preencha os dados abaixo.\n\nFicha de matrícula (fotos ou PDFs legíveis)\n\n* Nome completo:\n* Data de nascimento:\n* CPF:\n* RG (nº, órgão emissor, UF):\n* Nome completo da mãe:\n* Endereço completo (rua, nº, bairro, cidade, CEP):\n* Telefone celular atualizado:\n* E-mail pessoal:\n* Histórico do Ensino Médio (caso já tenha em mãos)", action: null };
    case "taxa": return { text: "Vou te enviar agora o boleto da taxa de matrícula e o código Pix copia e cola. Assim que você realizar o pagamento, me envia o comprovante para eu dar baixa junto ao setor financeiro, por gentileza.", action: null };
    case "comprovante": return { text: "Recebi, obrigado! Estou prosseguindo com a sua matrícula e já te aviso assim que ela for confirmada.", action: null };
    // before the enrollment is registered in the CRM the lead is never told it is confirmed: the step is to register it (the button)
    case "enroll": return { text: `${first(s.fullName || leadName) ? `${first(s.fullName || leadName)}, e` : "E"}stou finalizando a sua matrícula${s.courseName ? ` em *${s.courseName}*` : ""} junto à ${institutionName()} e te aviso assim que ela for confirmada.`, action: "enroll" };
    case "comunidade": return { text: "Agora a tutoria vai entrar em contato com você para auxiliar no primeiro acesso, na ambientação da plataforma e no início das disciplinas. Você também já pode entrar na Comunidade dos Alunos, onde enviamos os principais avisos e orientações durante a formação.", action: null };
    case "afiliado": return { text: "Se você conhece alguém que também queira estudar, pode participar do nosso programa de afiliados: quando a pessoa indicada realizar a matrícula e pagar a primeira mensalidade, você recebe uma comissão. Posso te explicar como funciona?", action: null };
    default: return null;
  }
};

// the rule of the course the lead asked for, from the same tool the agent uses
const courseRuleOf = async (s: Slots): Promise<Copilot["course"]> => {
  if (!s.courseId && !s.courseName) return null;
  try {
    const ctx: AcademicCtx = { ticket: null, dryRun: true, slots: { ...s }, patch: {}, cacheHits: 0, agentId: null };
    const arg = { courseId: s.courseId || undefined, courseName: s.courseName || undefined };
    const view = await runAcademicTool("buscar_regra_modalidade", arg, ctx);
    const m = view && !view.erro ? view.exigenciaMec : null;
    if (!m) return null;
    return { name: String(s.courseName || ""), formato: m.formato, resumo: m.resumo, percentualPresencial: m.percentualPresencial, semPratica: m.semPratica, fonte: m.fonte };
  } catch (err) {
    return null;
  }
};

const clip = (t: string, n: number): string => (t.length > n ? `${t.slice(0, n - 1).trim()}…` : t);
const hourOf = (d: Date): string => fmtTime(d);
const looksLikeQuestion = (text: string): boolean => /\?/.test(text) || /^\s*(como|quando|quanto|qual|quais|onde|por ?que|tem|posso|da pra|da para|e se|sera que)\b/.test(plain(text));
// how each step is named inside a sentence ("Você já pediu … às 16:09")
const STEP_SHORT: Partial<Record<StepKey, string>> = {
  entry: "a forma de ingresso", course: "o curso de interesse", city: "a cidade", format: "a confirmação de que o formato ficou claro", doubts: "as dúvidas",
  bolsa: "o nome completo e o CPF", ficha: "a ficha de matrícula e os documentos", taxa: "o pagamento da taxa de matrícula"
};
// a reminder for a question already sent (short, different from the first message, one question)
const reminderFor = (key: StepKey, s: Slots, name: string, ficha?: FichaLink | null): string => {
  const hi = name ? `${name}, ` : "";
  if (key === "ficha" && ficha) {
    return ficha.progress > 0
      ? `${hi}a sua ficha de matrícula está ${ficha.progress}% preenchida. Falta pouco: abra o link para completar, o que você já preencheu está salvo.\n\n${ficha.link}`
      : `${hi}conseguiu abrir a ficha de matrícula? É só preencher pelo link e tirar a foto do documento pelo celular.\n\n${ficha.link}`;
  }
  switch (key) {
    case "bolsa": return `${hi}conseguiu ver a minha mensagem? ${bolsaRequestFor({ name: !s.fullName, cpf: !s.cpfGiven })}`;
    case "format": return `${hi}ficou alguma dúvida sobre o formato do curso? Posso explicar de novo o ponto que não ficou claro.`;
    case "doubts": return `${hi}ficou alguma dúvida sobre o curso? Se estiver tudo certo, seguimos para a simulação da bolsa.`;
    case "ficha": return `${hi}conseguiu separar os documentos e preencher a ficha de matrícula? Se precisar de ajuda em algum campo, me avisa.`;
    case "taxa": return `${hi}conseguiu fazer o pagamento da taxa de matrícula? Quando puder, me envia o comprovante, por gentileza.`;
    case "entry": return `${hi}só para eu te orientar certo: essa seria a sua primeira graduação ou você já tem alguma faculdade?`;
    case "city": return `${hi}em qual cidade você mora? Assim vejo o polo mais perto de você.`;
    default: return `${hi}conseguiu ver a minha última mensagem?`;
  }
};
// the step taken up again after the lead said something else (never "caso não tenha" out of place)
const retakeFor = (key: StepKey, s: Slots, standard: string): string =>
  key === "bolsa" ? bolsaRequestFor({ name: !s.fullName, cpf: !s.cpfGiven }) : standard;

export const copilotOf = async (ticket: Ticket, config?: CopilotConfig): Promise<Copilot> => {
  const settings = config || await configOf();
  const lead = ticket.contactId ? await Lead.findOne({ where: { contactId: ticket.contactId }, attributes: ["id", "name", "cpf", "enrolledAt", "courseId", "poloId", "city", "state", "email", "phone", "entryTerm", "admissionType", "contactId"] }) : null;
  const state = lead ? await hydrate(await loadState(lead.id), lead) : { slots: {} as Slots };
  const { slots, asked, got, proposalSent, now } = await readConversation(ticket, state.slots, lead?.cpf || null);
  const progress = await CopilotProgress.findByPk(ticket.id);
  const overrides = progress?.overrides || {};
  const proposals = lead ? await Proposal.count({ where: { leadId: lead.id, sentAt: { [Op.ne]: null } } as any }) : 0;
  const fichaSent = lead ? !!(await EnrollmentForm.count({ where: { leadId: lead.id, submittedAt: { [Op.ne]: null } } as any })) : false;
  const enrolled = !!lead?.enrolledAt;
  const done: Record<StepKey, boolean> = {
    entry: !!slots.entryType && slots.entryType !== "unknown",
    objective: got.has("objective") || asked.has("objective"),
    course: !!(slots.courseName || slots.courseId),
    city: !!(slots.city || slots.poloId),
    format: !!(slots.modalityExplained || slots.mecExplained),
    grade: !!slots.gradeSent,
    doubts: !!(slots.doubtsOver || asked.has("bolsa") || (slots.fullName && slots.cpfGiven)),
    bolsa: !!(slots.fullName && slots.cpfGiven),
    proposal: proposals > 0 || proposalSent,
    // the steps after the proposal are the consultant's: the form asked, the fee sent, the proof received, the enrollment confirmed (always by the CRM), the tutoring and the community told
    // the form is done when the lead sends it (by the link, or the documents in the conversation), not when it is asked
    ficha: enrolled || fichaSent || got.has("ficha"),
    taxa: enrolled || asked.has("taxa"),
    comprovante: enrolled || got.has("comprovante"),
    enroll: enrolled,
    // the tutoring's contact goes to the student by itself when the enrollment is registered
    comunidade: enrolled || asked.has("comunidade"),
    afiliado: asked.has("afiliado")
  };
  const steps: CopilotStep[] = settings.steps.map(s => ({ key: s.key, label: s.label, instruction: s.instruction, done: completionOf(s.key, !!done[s.key as StepKey], overrides), manual: Object.prototype.hasOwnProperty.call(overrides, s.key), optional: !!s.optional }));
  // the process does not wait for the optional steps: the next one is the first undone step that is not optional (the optional one only when nothing else is left)
  const current = (steps.find(x => !x.done && !x.optional) || steps.find(x => !x.done))?.key || null;
  const configured = settings.steps.find(s => s.key === current);
  // the enrollment form of the lead (its personal link), when the process is at that step
  let ficha: FichaLink | null = null;
  if (current === "ficha" && lead && !lead.enrolledAt) {
    try {
      const { formForLead, staffView } = await import("../CrmServices/EnrollmentForm");
      const view = staffView(await formForLead(lead, null));
      if (view) ficha = { link: view.link, progress: view.progress };
    } catch (err) {
      ficha = null;
    }
  }
  const next = current ? (configured?.message ? { text: configured.message, action: null } : await textFor(current as StepKey, slots, lead?.name || "", ficha)) : null;
  const minutesSince = now.lastAt ? Math.max(0, Math.round((Date.now() - now.lastAt.getTime()) / 60000)) : null;
  const leadAsked = now.lastFrom === "lead" && !!now.lastLeadText && looksLikeQuestion(now.lastLeadText);
  const askedAt = current ? now.askedAt[current as StepKey] || null : null;
  const context: Copilot["context"] = { lastFrom: now.lastFrom, lastLeadText: now.lastLeadText ? clip(now.lastLeadText, 180) : null, leadAsked, minutesSince, askedCurrentAt: askedAt ? askedAt.toISOString() : null };
  let suggestion: Copilot["suggestion"] = next ? { text: next.text, action: next.action, kind: "next", note: null, ...(next.action === "send_grade" ? { gradeId: await gradeIdOf(slots) } : {}) } : null;
  if (suggestion && current && askedAt) {
    const label = STEP_SHORT[current as StepKey] || "esta etapa";
    if (!now.leadAfter[current as StepKey]) {
      // already said and nothing came back: never the same message again; a short reminder for when the lead takes long
      suggestion = { text: reminderFor(current as StepKey, slots, first(slots.fullName || lead?.name || ""), ficha), action: null, kind: "waiting", note: `Você já pediu ${label} às ${hourOf(askedAt)}. Aguarde a resposta do lead; se ele demorar, use o lembrete abaixo.` };
    } else if (now.lastFrom === "lead") {
      // the lead answered, but not what the step needs: the consultant answers what was said and takes the step up again
      suggestion = { ...suggestion, text: retakeFor(current as StepKey, slots, next!.text), kind: "reply", note: leadAsked ? `O lead respondeu com uma pergunta. Responda primeiro (use Sugerir resposta) e depois retome ${label}.` : `O lead respondeu, mas ainda falta ${label}. Reconheça o que ele disse e retome.` };
    }
  } else if (suggestion && leadAsked && current !== "doubts") {
    suggestion = { ...suggestion, kind: "reply", note: "O lead fez uma pergunta. Responda primeiro (use Sugerir resposta) e depois siga com a mensagem abaixo." };
  }
  // the doubts were just asked and the lead said nothing against: the data for the scholarship follows "caso não tenha"
  if (suggestion && suggestion.kind === "next" && current === "bolsa" && now.lastFrom === "team" && now.askedAt.doubts && !now.leadAfter.doubts) suggestion = { ...suggestion, text: `Caso não tenha dúvidas, ${suggestion.text.replace(/^./, c => c.toLowerCase())}` };
  return { hasLead: !!lead, leadId: lead?.id || null, steps, current, processVersion: settings.version, course: await courseRuleOf(slots), suggestion, context };
};

// the grade the "Enviar" of the grade step sends (the same choice the agent makes), null when the course has none
const gradeIdOf = async (s: Slots): Promise<number | null> => {
  try {
    const course = await findCourse({ courseId: s.courseId, courseName: s.courseName });
    if (!course) return null;
    const { grade } = await pickGrade(course, null);
    return grade ? grade.id : null;
  } catch (err) {
    return null;
  }
};
