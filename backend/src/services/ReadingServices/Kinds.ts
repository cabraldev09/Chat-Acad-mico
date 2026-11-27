import { OBJECTION_TYPES } from "../CommercialServices/Rules";
import { scrub } from "../AnalyticsServices/Scrub";

// What each kind of reading asks the model and how its answer is checked. Pure: no database here (the parsers are tested alone).
// The answer is always JSON with codes and short texts with no names or numbers; anything outside the codes is dropped.

export const READING_KINDS = ["importacao", "resultado", "revisao"] as const;
export type ReadingKind = typeof READING_KINDS[number];

// the stages a reading may put a lead in (never "Matriculado" by the model: an enrollment needs the RGM, see ImportedLeads)
export const OPEN_STAGES = ["contact_started", "in_service", "qualified", "ready_for_proposal", "proposal", "enrollment_in_progress"] as const;
export const SITUATIONS = ["matriculado", "em_andamento", "sem_resposta", "desistiu"] as const;

// what made a sale happen (or was missing in a loss): codes the statistics count
export const WORKED: Record<string, string> = {
  rapidez: "respondeu rápido",
  grade: "enviou a grade do curso",
  proposta_no_dia: "enviou a proposta no mesmo dia",
  bolsa: "explicou a bolsa e os valores",
  retorno_combinado: "combinou e cumpriu o retorno",
  audio: "usou áudio para explicar",
  analise_curricular: "fez a análise curricular",
  tirou_duvidas: "tirou as dúvidas sobre o EAD",
  urgencia: "mostrou o prazo da turma",
  indicacao: "veio por indicação"
};

export const LOST_REASONS = [
  "Preço / mensalidade", "Escolheu outra instituição", "Sem resposta", "Horário incompatível", "Curso indisponível",
  "Desistiu de estudar", "Sem documentação", "Reprovou / não elegível", "Outro"
];

const clean = (v: any, max: number): string => scrub(String(typeof v === "string" ? v : "")).replace(/\s+/g, " ").trim().slice(0, max);
const raw = (text: string): any => {
  const body = String(text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim();
  let parsed: any;
  try { parsed = JSON.parse(body); } catch { throw new Error("ERR_AI_BAD_ANSWER"); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("ERR_AI_BAD_ANSWER");
  return parsed;
};
const oneOf = <T extends string>(v: any, list: readonly T[], fallback: T | null = null): T | null => (list.includes(String(v) as T) ? (String(v) as T) : fallback);
const codes = (v: any, allowed: string[], max = 6): string[] => [...new Set((Array.isArray(v) ? v : []).map(String).filter(k => allowed.includes(k)))].slice(0, max);

// ------------------------------------------------------------------------------------------------ importacao
// what a consultant can do better in a conversation (the "melhorar" of the evaluation): the code, what the screen says and how to do it
export const IMPROVE: Record<string, { label: string; how: string }> = {
  responder_rapido: { label: "Responder mais rápido", how: "Responda em poucos minutos no horário de trabalho: quem espera esfria e procura outra faculdade." },
  uma_pergunta_por_vez: { label: "Uma pergunta por vez", how: "Faça uma pergunta e espere a resposta antes da próxima; várias juntas confundem e ficam sem resposta." },
  descobrir_necessidade: { label: "Entender a pessoa antes de oferecer", how: "Pergunte o objetivo, a rotina e o que pesa na escolha antes de falar de curso e valor." },
  personalizar: { label: "Personalizar o atendimento", how: "Use o que a pessoa contou (objetivo, rotina, cidade) em vez de mensagens prontas." },
  enviar_grade: { label: "Enviar a grade do curso", how: "Mande a grade logo que a pessoa escolher o curso e destaque duas ou três disciplinas que combinam com ela." },
  mostrar_beneficios: { label: "Mostrar o valor do curso", how: "Fale do que a pessoa ganha (diploma reconhecido, flexibilidade do EAD, carreira) antes do preço." },
  apresentar_bolsa: { label: "Apresentar a bolsa e o valor final", how: "Mostre a bolsa e o valor que a pessoa vai pagar, como estão na proposta, antes que ela pergunte." },
  enviar_proposta: { label: "Enviar a proposta", how: "Envie a proposta no mesmo dia em que a pessoa demonstrar interesse." },
  tratar_objecao: { label: "Tratar a objeção", how: "Quando a pessoa disser que está caro ou sem tempo, pergunte o motivo e responda com uma solução, sem desistir na primeira." },
  criar_urgencia: { label: "Mostrar o prazo da turma", how: "Diga a data real de início da turma e até quando vale a condição, sem inventar prazo." },
  fechar_proximo_passo: { label: "Combinar o próximo passo", how: "Termine cada conversa com um passo marcado: dia do retorno, envio de documento ou matrícula." },
  followup: { label: "Fazer o retorno", how: "Se a pessoa parar de responder, volte a chamar em 1, 3 e 7 dias com algo novo, não só um oi." },
  ortografia: { label: "Cuidar da escrita", how: "Revise antes de enviar: palavras completas, acentos e frases curtas passam confiança." },
  apresentar_previsao: { label: "Apresentar a previsão de conclusão", how: "Na transferência ou segunda graduação, diga em quantos semestres a pessoa se forma com o aproveitamento." },
  apresentar_disciplinas: { label: "Apresentar as disciplinas aproveitadas", how: "Mostre quais disciplinas ela aproveita e quais ainda faltam, com a análise curricular." }
};
export const NOTE_KEYS = ["tecnica", "persuasao", "negociacao", "ortografia", "agilidade"] as const;
export type NoteKey = typeof NOTE_KEYS[number];

export interface Evaluation {
  whyNot: string;
  notes: Record<NoteKey, number | null>;
  sentGrade: boolean | null;
  sentProposal: boolean | null;
  followUp: boolean | null;
  transfer: boolean | null;
  showedCompletion: boolean | null;
  showedSubjects: boolean | null;
  improve: string[];
}

// a note is an integer from 0 to 10 (outside, clamped); anything that is not a number is "no evidence"
const note = (v: any): number | null => {
  if (v === null || v === undefined || v === "" || typeof v === "boolean") return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(10, Math.max(0, Math.round(n))) : null;
};
const yesNo = (v: any): boolean | null => (v === true || v === false ? v : null);

// strict: every field optional; codes outside the list are dropped; a transfer item only exists in a transfer; nothing of it in an enrollment
export const parseEvaluation = (v: any, enrolled: boolean): Evaluation | null => {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const transfer = yesNo(v.transferencia);
  const allowed = Object.keys(IMPROVE).filter(k => transfer === true || !["apresentar_previsao", "apresentar_disciplinas"].includes(k));
  const improve = codes(v.melhorar, allowed, 3);
  return {
    whyNot: enrolled ? "" : clean(v.por_que_nao_converteu, 160),
    notes: Object.fromEntries(NOTE_KEYS.map(k => [k, note(v[k])])) as Record<NoteKey, number | null>,
    sentGrade: yesNo(v.enviou_grade),
    sentProposal: yesNo(v.apresentou_proposta),
    followUp: yesNo(v.fez_followup),
    transfer,
    showedCompletion: transfer === true ? yesNo(v.apresentou_previsao_conclusao) : null,
    showedSubjects: transfer === true ? yesNo(v.apresentou_disciplinas) : null,
    improve
  };
};

export const IMPORT_SYSTEM = [
  "Você lê, para a equipe comercial de uma faculdade EAD, uma conversa antiga de WhatsApp entre um consultor e uma pessoa.",
  "Dados pessoais e números foram trocados por marcadores como [NOME] e [NUM]. Não invente nada que não esteja na conversa.",
  "Diga se a pessoa é um lead (alguém interessado em estudar na faculdade) ou não (amigo, família, colega, fornecedor, aluno pedindo só suporte).",
  "Atenção: o contato NÃO é lead quando é da equipe (consultor, coordenador, tutor, secretaria, polo) ou parceiro, e quando só repassa ou recebe dados de OUTRA pessoa",
  "(nome, CPF, inscrição, RGM, curso de um aluno). Nesse caso a matrícula citada é de outra pessoa: e_lead=false e contato_tipo equipe ou parceiro.",
  "contato_tipo: lead (a própria pessoa quer estudar), equipe, parceiro ou outro (amigo, família, fornecedor, suporte).",
  "Se for lead, diga a situação: matriculado (fez a matrícula), em_andamento (ainda decidindo), sem_resposta (parou de responder) ou desistiu (disse que não vai fazer).",
  `etapa (só para em_andamento): ${OPEN_STAGES.join(", ")}.`,
  `objecao: ${OBJECTION_TYPES.join(", ")} ou nenhuma.`,
  "Responda só com JSON válido, sem markdown, exatamente no formato",
  "{\"e_lead\":boolean,\"contato_tipo\":string,\"situacao\":string,\"curso\":string,\"etapa\":string,\"objecao\":string,\"motivo\":string,\"resumo\":string,\"proximo_passo\":string,\"parou_em\":string,\"pendente\":string,\"melhorar\":string,\"polo\":string,",
  "\"avaliacao\":{\"por_que_nao_converteu\":string,\"tecnica\":number|null,\"persuasao\":number|null,\"negociacao\":number|null,\"ortografia\":number|null,\"agilidade\":number|null,",
  "\"enviou_grade\":boolean|null,\"apresentou_proposta\":boolean|null,\"fez_followup\":boolean|null,\"transferencia\":boolean|null,\"apresentou_previsao_conclusao\":boolean|null,\"apresentou_disciplinas\":boolean|null,\"melhorar\":string[]}}.",
  "curso: o nome do curso de interesse ou vazio. motivo: até 140 caracteres, por que não avançou (vazio se avançou).",
  "resumo: até 300 caracteres, o que a pessoa quer e em que ponto parou, para o consultor retomar a venda. proximo_passo: até 140 caracteres.",
  "parou_em: até 80 caracteres, a etapa em que a conversa parou (ex.: esperando a proposta, enviando documentos, decidindo o curso).",
  "pendente: até 140 caracteres, o que ficou combinado e não foi feito, por quem (consultor ou interessado), ou vazio.",
  "melhorar: até 140 caracteres, o que o consultor poderia ter feito melhor no atendimento (ex.: responder mais rápido, mandar a grade, fazer uma pergunta por vez), ou vazio.",
  "polo: o nome do polo ou da cidade de estudo citado na conversa, ou vazio. Nunca escreva valores, bolsas ou prazos que não estejam na conversa.",
  // the evaluation of the consultant in the same answer (no second call): notes, yes/no and codes, never a name or a number of the person
  "avaliacao (só se for lead; senão null): como o consultor atendeu nesta conversa. Notas inteiras de 0 a 10 (5 = mediano, 10 = exemplar), ou null quando a conversa não mostra:",
  "tecnica (cria vínculo, pergunta para entender a pessoa, uma pergunta por vez, conduz ao próximo passo), persuasao (mostra o valor do curso, benefícios, prova e o prazo real da turma),",
  "negociacao (bolsa, resposta à objeção, proposta, fechamento), ortografia (escrita correta e clara, sem abreviações), agilidade (rapidez nas respostas e no retorno, pelo que a conversa mostra).",
  "enviou_grade (mandou a grade do curso), apresentou_proposta, fez_followup (voltou a chamar quando a pessoa sumiu): true, false ou null.",
  "transferencia: true quando é transferência, segunda graduação ou aproveitamento de disciplinas; aí apresentou_previsao_conclusao (disse quando a pessoa se forma) e",
  "apresentou_disciplinas (disse quais disciplinas ela aproveita) são true ou false; senão transferencia false e os dois null.",
  "por_que_nao_converteu: até 160 caracteres, a causa principal de não ter feito a matrícula (vazio se matriculou).",
  `avaliacao.melhorar: lista de até 3 códigos (não é a frase de "melhorar" acima), do mais importante ao menos, entre ${Object.keys(IMPROVE).join(", ")}.`
].join(" ");

export const CONTACT_TYPES = ["lead", "equipe", "parceiro", "outro"] as const;

export interface ImportAnswer {
  isLead: boolean;
  contactType: typeof CONTACT_TYPES[number];
  situation: typeof SITUATIONS[number];
  course: string;
  stage: typeof OPEN_STAGES[number] | null;
  objection: string | null;
  reason: string;
  summary: string;
  next: string;
  stalledAt: string;
  pending: string;
  improve: string;
  polo: string;
  // how the consultant did (null: not a lead, or a reading made before the evaluation existed)
  evaluation: Evaluation | null;
}

export const parseImportAnswer = (text: string): ImportAnswer => {
  const p = raw(text);
  // a colleague, a partner or someone else is never a lead, whatever "e_lead" says (the enrollment they talk about is of another person)
  const contactType = oneOf(p.contato_tipo, CONTACT_TYPES, p.e_lead === true ? "lead" : "outro") as ImportAnswer["contactType"];
  const isLead = p.e_lead === true && contactType === "lead";
  const situation = oneOf(p.situacao, SITUATIONS, "em_andamento") as ImportAnswer["situation"];
  return {
    isLead,
    contactType,
    situation,
    course: clean(p.curso, 80),
    stage: situation === "em_andamento" ? oneOf(p.etapa, OPEN_STAGES, "in_service") : null,
    objection: oneOf(p.objecao, OBJECTION_TYPES as readonly string[]),
    reason: clean(p.motivo, 140),
    summary: clean(p.resumo, 300),
    next: clean(p.proximo_passo, 140),
    stalledAt: clean(p.parou_em, 80),
    pending: clean(p.pendente, 140),
    improve: clean(p.melhorar, 140),
    polo: clean(p.polo, 80),
    evaluation: isLead ? parseEvaluation(p.avaliacao, situation === "matriculado") : null
  };
};

// the lost reason of the CRM from the objection the reading found (the same words of crmOptions.lostReasons)
export const lostReasonFor = (objection: string | null, situation: string): string => {
  if (situation === "sem_resposta") return "Sem resposta";
  if (objection === "preco") return "Preço / mensalidade";
  if (objection === "concorrente") return "Escolheu outra instituição";
  if (objection === "tempo") return "Horário incompatível";
  if (objection) return "Outro";
  return "Desistiu de estudar";
};

// the RGM written in the conversation, read in code (the model never sees numbers): "RGM 1234567", "meu rgm é 12.345.678-9"
export const findRgm = (texts: string[]): string | null => {
  for (const t of texts) {
    const m = String(t || "").match(/\brgm\b[^0-9\n]{0,15}(\d[\d.\-]{4,14}\d)/i);
    if (m) return m[1].replace(/\D/g, "");
  }
  return null;
};

// ------------------------------------------------------------------------------------------------ resultado
export const OUTCOME_SYSTEM = [
  "Você ajuda a gestão comercial de uma faculdade EAD a entender por que as vendas acontecem e por que se perdem.",
  "Leia a conversa entre o consultor e o interessado. Dados pessoais foram trocados por marcadores. Não invente nada.",
  `resultado: matriculou, perdeu ou parou (parou = sem resposta). motivo (só se perdeu ou parou): um destes: ${LOST_REASONS.join("; ")}.`,
  `objecoes: tipos levantados pelo interessado, entre ${OBJECTION_TYPES.join(", ")}.`,
  `o_que_funcionou: o que o consultor fez que ajudou, entre ${Object.keys(WORKED).join(", ")}.`,
  `faltou: o que não foi feito e teria ajudado, entre os mesmos códigos.`,
  "Responda só com JSON válido, sem markdown, exatamente no formato",
  "{\"resultado\":string,\"motivo\":string,\"objecoes\":string[],\"o_que_funcionou\":string[],\"faltou\":string[]}."
].join(" ");

export interface OutcomeAnswer { outcome: "matriculou" | "perdeu" | "parou"; reason: string | null; objections: string[]; worked: string[]; missed: string[] }

export const parseOutcomeAnswer = (text: string, known?: "matriculou" | "perdeu" | "parou"): OutcomeAnswer => {
  const p = raw(text);
  // the result is the one the CRM knows (the model only explains it)
  const outcome = known || (oneOf(p.resultado, ["matriculou", "perdeu", "parou"] as const, "parou") as OutcomeAnswer["outcome"]);
  return {
    outcome,
    reason: outcome === "matriculou" ? null : oneOf(p.motivo, LOST_REASONS) || (outcome === "parou" ? "Sem resposta" : "Outro"),
    objections: codes(p.objecoes, OBJECTION_TYPES as unknown as string[], 8),
    worked: codes(p.o_que_funcionou, Object.keys(WORKED)),
    missed: codes(p.faltou, Object.keys(WORKED))
  };
};

// what the screen of the management says from the counts: the codes that most separate the enrollments from the losses (free, no model)
export const outcomeIdeas = (rows: Array<{ outcome: string; worked: string[]; missed: string[] }>, min = 5): string[] => {
  const won = rows.filter(r => r.outcome === "matriculou");
  const lost = rows.filter(r => r.outcome !== "matriculou");
  if (won.length < min || lost.length < min) return [];
  const share = (list: typeof rows, k: string) => list.filter(r => r.worked.includes(k)).length / list.length;
  return Object.keys(WORKED)
    .map(k => ({ k, w: share(won, k), l: share(lost, k) }))
    .filter(x => x.w - x.l >= 0.2)
    .sort((a, b) => b.w - b.l - (a.w - a.l))
    .slice(0, 3)
    .map(x => `Nas matrículas, "${WORKED[x.k]}" aparece em ${Math.round(x.w * 100)}% das conversas; nas perdas, em ${Math.round(x.l * 100)}%. Vale tornar isso padrão.`);
};
// "meu RGM é 7654321", "protocolo 12.345-6": the digits never leave (a price "199,90" or a date "10/02/2027" stays readable)
export const maskLongNumbers = (text: string): string => String(text || "").replace(/\d[\d.\-]{4,}\d/g, m => (m.replace(/\D/g, "").length >= 6 ? "[NUM]" : m));

// ------------------------------------------------------------------------------------------------ colleagues and third people
// a contact saved with a job of the team ("Douglas Coordenador", "Jane Consultora", "Pedro Tutor Vilhena"): a strong sign of a colleague. A
// teacher ("Prof Leila") is NOT here: teachers are often leads (a second degree, the pedagogical training).
// The coordination ("Coordenação Polo Vilhena") and a polo saved by its name ("Polo Cruzeiro do Sul Buritis Ro") are the team too; "polo" in
// the middle of a person's name ("Ana Polo Vilhena") is not.
export const TEAM_NAME = /\b(coordenador(a)?|coord\.?|coordena[cç][aã]o|consultor(a)?|tutor(a)?|secretaria|secret[aá]ri[oa]|equipe|ambienta[cç][aã]o)(?![\p{L}])|^\s*polo\b/iu;
export const teamByName = (name: string | null | undefined): boolean => TEAM_NAME.test(String(name || ""));

// the data of an enrollment sent in the conversation as a record ("Nome: ...", "CPF: ...", "Inscrição: ..."): what colleagues pass to each
// other about a student. Two labels or more in one message, and the name in it is NOT the contact's own (a lead sending their own data, or
// the consultant sending it back to them, is not a colleague).
const RECORD_LABELS = [/\bnome( completo)?\s*:/i, /\bcpf\s*:/i, /\binscri[cç][aã]o\s*:/i, /\brgm\s*:/i, /\bcurso\s*:/i, /\bmatr[ií]cula\s*:/i, /\bcupom\s*:/i, /\bpolo\s*:/i];
const LABELLED = /(\b(?:nome(?: completo)?|alun[oa]|candidat[oa]|interessad[oa]|respons[aá]vel)\s*:\s*)([^\n:]{2,80}?)(?=\s+(?:cpf|inscri|rgm|curso|e-?mail|telefone|celular|cupom)\b|\n|$)/gi;
const norm = (v: string): string => String(v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
// the same person: the first name (of 3 letters or more) of one is in the other
const samePerson = (name: string, own: string[]): boolean => {
  const first = norm(name).split(" ")[0] || "";
  return first.length >= 3 && own.some(o => norm(o).split(" ").includes(first));
};
export const hasRecordOfSomeone = (texts: string[], own: string[] = []): boolean => texts.some(t => {
  const text = String(t || "");
  if (RECORD_LABELS.filter(r => r.test(text)).length < 2) return false;
  const names = [...text.matchAll(new RegExp(LABELLED.source, "gi"))].map(m => m[2]);
  return !names.length || names.some(n => !samePerson(n, own));
});

// the name written after a label never goes to the model (the rule of the readings: no names): the contact's own is [NOME], anyone
// else's is [OUTRA PESSOA]
export const maskLabelledNames = (text: string, own: string[] = []): string =>
  String(text || "").replace(new RegExp(LABELLED.source, "gi"), (_m, label, name) => `${label}${samePerson(name, own) ? "[NOME]" : "[OUTRA PESSOA]"}`);

// what the code knows and the model cannot see (the names are masked): said before the conversation
export const importHints = (contactName: string | null | undefined, texts: string[], own: string[] = []): string => {
  const hints: string[] = [];
  if (teamByName(contactName)) hints.push("o contato está salvo na agenda com um cargo da equipe (coordenador, consultor, tutor, secretaria ou polo)");
  if (hasRecordOfSomeone(texts, own)) hints.push("a conversa traz dados de cadastro de alguém (Nome:, CPF:, Inscrição:), o que é comum entre colegas que falam de um aluno");
  return hints.length ? `Pistas do sistema: ${hints.join("; ")}.\n\n` : "";
};
