import Lead from "../../models/Lead";
import Message from "../../models/Message";
import Proposal from "../../models/Proposal";
import Ticket from "../../models/Ticket";
import { bolsaDataFrom, bolsaRequestFor } from "./BolsaData";
import { detectFromText } from "./Detect";
import { runAcademicTool, AcademicCtx } from "./Academic";
import { TUTORING_PITCH } from "./GradeChoice";
import { DOUBTS_QUESTION, PRESENT_BRIDGE, QUESTIONS, durationLine, entryAnswer, modalityTextOf } from "./Rules";
import { loadState, Slots } from "./Slots";

// THE COPILOT OF THE CONSULTANT. After the agent hands the conversation over, the consultant goes on with the same process the team follows:
// first degree → course → city → format and MEC → grade, tutoring and internship → doubts → full name and CPF → proposal → enrollment.
// The state is read from the conversation itself (what the lead said, what the consultant already sent), so it keeps up after the handover, when the
// state saved by the agent no longer changes. Nothing here writes to the lead or sends anything: it only says where the process is and what to say next.

export type StepKey = "entry" | "objective" | "course" | "city" | "format" | "grade" | "doubts" | "bolsa" | "proposal" | "ficha" | "taxa" | "comprovante" | "enroll" | "comunidade" | "afiliado";

export interface CopilotStep {
  key: StepKey;
  label: string;
  done: boolean;
  // a step the process does not wait for (the objective of the lead, the referral program)
  optional: boolean;
}

export interface Copilot {
  hasLead: boolean;
  leadId: number | null;
  steps: CopilotStep[];
  current: StepKey | null;
  // what the MEC asks of the course of the lead (the consultant says the same as the agent): "EAD: sem aulas práticas presenciais", "Semipresencial: 40% de prática presencial"
  course: { name: string; formato: string; resumo: string; percentualPresencial: number | null; semPratica: boolean; fonte: string } | null;
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
  objective: "Objetivo com a graduação",
  ficha: "Ficha de matrícula e documentos",
  taxa: "Taxa de matrícula (Pix ou boleto)",
  comprovante: "Comprovante recebido",
  enroll: "Matrícula confirmada",
  comunidade: "Tutoria e Comunidade dos Alunos",
  afiliado: "Programa de afiliados"
};
const ORDER: StepKey[] = ["entry", "objective", "course", "city", "format", "grade", "doubts", "bolsa", "proposal", "ficha", "taxa", "comprovante", "enroll", "comunidade", "afiliado"];
const OPTIONAL: StepKey[] = ["objective", "afiliado"];

const plain = (s: string): string => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// what the conversation says, in order: the lead's words fill what is missing; what the consultant sent marks what was already done
export const readConversation = async (ticket: Ticket, slots: Slots, leadCpf: string | null): Promise<{ slots: Slots; asked: Set<StepKey>; got: Set<StepKey>; proposalSent: boolean }> => {
  const out: Slots = { ...slots };
  const asked = new Set<StepKey>();
  // what the lead already gave (the documents and data of the form, the proof of payment, the objective)
  const got = new Set<StepKey>();
  let proposalSent = false;
  const rows = await Message.findAll({ where: { ticketId: ticket.id } as any, order: [["createdAt", "ASC"]], limit: 300, attributes: ["id", "body", "fromMe", "mediaType", "createdAt"] });
  let lastMine = "";
  for (const m of rows) {
    const text = String(m.body || "").replace(/^[‎‏]+/, "");
    if (m.fromMe) {
      lastMine = text;
      const t = plain(text);
      if (/ate aqui voce compreendeu/.test(t)) { out.modalityExplained = true; out.courseExplained = true; }
      const isProposal = /\bproposta\b/.test(t);
      if (!isProposal && (/matriz curricular|grade do curso|\.pdf/.test(t) || (m.mediaType === "document" && /pdf/.test(t)))) out.gradeSent = true;
      if (/alguma duvida|tem algo que eu posso/.test(t)) asked.add("doubts");
      if (/nome completo e cpf|nome completo e o cpf/.test(t)) asked.add("bolsa");
      if (isProposal && (/(encaminhando|segue|enviei|anexo|valor de)/.test(t) || /\.pdf|document/.test(t) || m.mediaType === "document")) proposalSent = true;
      // the steps after the proposal, as the consultant does them
      if (/\bobjetivo\b|concurso publico|prestar concurso|formacao superior rapida/.test(t) && /\?/.test(text)) asked.add("objective");
      if (/ficha de matricula|nome completo da mae/.test(t)) asked.add("ficha");
      if (/\b(pix|boleto)\b/.test(t) && /taxa|matricula|copia e cola/.test(t)) asked.add("taxa");
      // (the agent also speaks of the tutoring while it presents the course: only the invitation to the community of the students is the step)
      if (/comunidade dos alunos/.test(t)) asked.add("comunidade");
      if (/afiliad|programa de indicac|indicar (um|uma|alguem)/.test(t)) asked.add("afiliado");
      continue;
    }
    // what the lead sends after those steps: documents and photos count (the file is not read here)
    const lead = plain(text);
    const hasFile = m.mediaType === "image" || m.mediaType === "document" || /\.(pdf|jpe?g|png)\b/.test(lead);
    if (asked.has("ficha") && (hasFile || /\b(rg|cnh|nascimento|endereco|cep|nome da mae|mae)\b/.test(lead))) got.add("ficha");
    if (asked.has("taxa") && (hasFile || /\b(pix feito|paguei|pago|comprovante|transferi)\b/.test(lead))) got.add("comprovante");
    if (asked.has("objective") || /\b(concurso|segunda graduacao|formacao rapida|mudar de area|crescer na carreira|promocao|abrir (um )?negocio)\b/.test(lead)) got.add("objective");
    if (!text.trim() || /^\[/.test(text)) continue;
    // eslint-disable-next-line no-await-in-loop
    const found = await detectFromText(text).catch(() => ({} as Record<string, any>));
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
  return { slots: out, asked, got, proposalSent };
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
    case "objective": return { text: s.courseName ? `Para eu te orientar certinho e não te indicar nada fora do seu objetivo: você está buscando o curso de *${s.courseName}* pensando em prestar concurso público, em crescer na carreira ou mais para ter uma formação superior e usar profissionalmente?` : "Para eu te orientar certinho e não te indicar nada fora do seu objetivo: você está buscando essa graduação pensando em prestar concurso público ou mais para ter uma formação superior e usar profissionalmente?", action: null };
    case "ficha": return { text: "Perfeito! Para dar andamento à matrícula, preciso da foto do seu RG ou CNH (frente e verso) e que você preencha os dados abaixo.\n\nFicha de matrícula (fotos ou PDFs legíveis)\n\n* Nome completo:\n* Data de nascimento:\n* CPF:\n* RG (nº, órgão emissor, UF):\n* Nome completo da mãe:\n* Endereço completo (rua, nº, bairro, cidade, CEP):\n* Telefone celular atualizado:\n* E-mail pessoal:\n* Histórico do Ensino Médio (caso já tenha em mãos)", action: null };
    case "taxa": return { text: "Vou te enviar agora o boleto da taxa de matrícula e o código Pix copia e cola. Assim que você realizar o pagamento, me envia o comprovante para eu dar baixa junto ao setor financeiro, por gentileza.", action: null };
    case "comprovante": return { text: "Recebi, obrigado! Estou prosseguindo com a sua matrícula e já te aviso assim que ela for confirmada.", action: null };
    case "enroll": return { text: `${first(s.fullName || leadName) ? `${first(s.fullName || leadName)}, s` : "S"}ua matrícula${s.courseName ? ` em *${s.courseName}*` : ""} foi confirmada com sucesso! Parabéns por essa nova etapa. Seja muito bem-vindo(a) à Cruzeiro do Sul Virtual!`, action: "enroll" };
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

export const copilotOf = async (ticket: Ticket): Promise<Copilot> => {
  const lead = ticket.contactId ? await Lead.findOne({ where: { contactId: ticket.contactId }, attributes: ["id", "name", "cpf", "enrolledAt", "courseId"] }) : null;
  if (!lead) return { hasLead: false, leadId: null, steps: [], current: null, course: null, suggestion: null };
  const state = await loadState(lead.id);
  const { slots, asked, got, proposalSent } = await readConversation(ticket, state.slots, lead.cpf || null);
  const proposals = await Proposal.count({ where: { leadId: lead.id } as any }).catch(() => 0);
  const enrolled = !!lead.enrolledAt;
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
    // the steps after the proposal are the consultant's: the form asked, the fee sent, the proof received, the enrollment confirmed, the tutoring and the community told
    ficha: enrolled || asked.has("ficha"),
    taxa: enrolled || asked.has("taxa"),
    comprovante: enrolled || got.has("comprovante"),
    enroll: enrolled,
    comunidade: asked.has("comunidade"),
    afiliado: asked.has("afiliado")
  };
  const steps: CopilotStep[] = ORDER.map(key => ({ key, label: STEP_LABEL[key], done: done[key], optional: OPTIONAL.includes(key) }));
  // the process does not wait for the optional steps: the next one is the first undone step that is not optional (the optional one only when nothing else is left)
  const current = (steps.find(x => !x.done && !x.optional) || steps.find(x => !x.done))?.key || null;
  const next = current ? await textFor(current, slots, lead.name) : null;
  return { hasLead: true, leadId: lead.id, steps, current, course: await courseRuleOf(slots), suggestion: next ? { text: next.text, action: next.action } : null };
};
