import { CommercialState, Slots } from "./Slots";

// The commercial rules, written as plain functions: the same input always gives the same answer, no model involved. The AI only
// understands what the person said (the intent); the temperature, the score, the next action, the funnel column, the notes and the
// handoff brief are computed here.
export const INTENTS = [
  "greeting", "course_duration", "course_modality", "mec", "curriculum", "internship", "paid_internship", "tcc", "platform", "tutoring", "faculty",
  "recognition", "transfer", "second_degree", "analysis", "price", "enrollment", "proposal", "human", "follow_up", "no_interest", "objection", "unknown", "other"
] as const;

const plain = (s: string): string =>
  String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

// ---------------------------------------------------------------- what is obvious needs no model
const HUMAN = [
  /(falar|conversar|passar|chamar).{0,30}(com )?(uma |um )?(pessoa|atendente|humano|consultor|consultora|vendedor|vendedora|gente de verdade)/,
  /(quero|preciso|prefiro|gostaria de).{0,12}(um |uma )?(atendente|consultor|consultora|humano|pessoa de verdade)/,
  /(me )?(passa|passe|transfere|transfira) (pra|para) (um |uma )?(atendente|consultor|consultora|pessoa)/
];
// a price, a scholarship, an enrollment or a proposal: the moment of the human proposal (the agent never gives a number)
const MONEY = [
  /\b(qual (e )?o? ?valor|qual (e )?o? ?preco|valor da mensalidade|valores|preco|precos|mensalidade|parcela|parcelas)\b/,
  /\bquanto (custa|fica|pago|vai custar|sai|cobram|e o curso|e a mensalidade)\b/,
  /\b(tem|ha|existe|consigo|posso ter) (alguma )?(bolsa|desconto)\b/,
  /\b(bolsa|desconto|promocao|condicao especial|forma de pagamento|formas de pagamento)\b/,
  /\b(me )?(manda|envia|passa|faz|gera|quero|queria|gostaria d[ea]|preciso d[ea]) (a |uma |sua )?proposta\b/,
  /\bquero saber quanto\b/
];
const ENROLL = [
  /quero (me )?matricular/,
  /quero (fazer|garantir|realizar) (a |minha )?(matricula|inscricao)/,
  /pode (prosseguir|seguir|continuar com a matricula)/,
  /vamos (fechar|prosseguir|matricular)/,
  /como (eu )?(faco|fazer) (pra|para) (me )?matricular/
];
const NO_INTEREST = [/nao tenho (mais )?interesse/, /\bdesisti\b/, /nao quero (mais )?(fazer|continuar|saber|estudar)/, /\bsem interesse\b/, /nao me interessa/];

export type FastIntent = { intent: "human" | "price" | "enrollment" | "proposal" } | null;

// "não quero falar com atendente", "ainda não quero me matricular": the phrase is there, the meaning is the opposite
const NEGATION = /\b(nao|nunca|jamais|sem|ainda nao|nem)\b/;
const hit = (list: RegExp[], t: string): boolean =>
  list.some(r => {
    const m = r.exec(t);
    return !!m && !NEGATION.test(t.slice(Math.max(0, m.index - 22), m.index));
  });

export const fastIntent = (text: string): FastIntent => {
  const t = plain(text);
  if (!t) return null;
  if (hit(HUMAN, t)) return { intent: "human" };
  if (hit(ENROLL, t)) return { intent: "enrollment" };
  if (/\bproposta\b/.test(t) && hit(MONEY, t)) return { intent: "proposal" };
  if (hit(MONEY, t)) return { intent: "price" };
  return null;
};

// the person takes back what made the lead "ready for the proposal"
export const retractsBuying = (text: string): boolean => {
  const t = plain(text);
  return /\b(nao (vou|quero) (mais )?(me )?(matricular|fechar|prosseguir)|ainda nao (vou|quero|decidi|fechei)|deixa (pra|para) depois|desisti)\b/.test(t);
};

// A reason to hand the conversation to a person that needs no model to be seen: an unhappy person, money already paid or a legal
// word, a wrong number, or the same request for the third time. The reason travels to the team in the handoff.
const COMPLAINT = /\b(absurdo|pessim[oa]|horrivel|palhacada|vergonha|decepcion\w*|reclam(ar|acao|ando)|procon|processar|processo|advogad\w*|justica|denunci\w*|golpe|enganad\w*|fraude|estorno|reembolso|ja paguei|paguei|comprovante|cancelar (a |minha )?(matricula|inscricao|contrato)|cobranca indevida)\b/;
const WRONG_NUMBER = /\b(numero errado|nao sou (eu|essa pessoa|ele|ela)|foi engano|engano|nao conheco (voce|vocês)|quem e voce)\b/;
export const humanReason = (text: string, previousUserTexts: string[] = []): "complaint" | "loop" | "other" | null => {
  const t = plain(text);
  if (!t) return null;
  if (COMPLAINT.test(t)) return "complaint";
  if (WRONG_NUMBER.test(t)) return "other";
  // the same sentence again, twice before: the AI is not solving it
  if (t.length >= 8 && previousUserTexts.map(plain).filter(p => p === t).length >= 2) return "loop";
  return null;
};

// a message that only says hello or shows interest, with nothing to answer: the opening of the system is enough (no model)
const GREET_WORDS = /^(oi+|ola+|opa|e ai|eae|bom dia|boa tarde|boa noite|boa madrugada|hello|hi|tudo bem|tudo bom|td bem|tudo certo|blz|beleza)\b[ ,.!]*/;
const INTEREST_ONLY = /^((eu )?(quero|queria|gostaria de|preciso de|tenho interesse em|me interessei (em|por)))? ?(mais )?(informacao|informacoes|saber mais|conhecer)( (do|dos|sobre o|sobre os) (curso|cursos|valores))?( por favor| pfv)?$|^(tenho interesse|me interessei)( no curso| nos cursos)?$|^vim (pelo|pela|do|da|de|atraves).{0,30}$|^(voltei|estou de volta|to de volta|cheguei|de novo|de volta)( aqui)?$/;
export const isGreeting = (text: string): boolean => {
  let t = plain(text);
  if (!t || t.length > 70 || t.includes("?")) return false;
  if (fastIntent(text) || humanReason(text)) return false;
  // greetings first ("bom dia, tudo bem?"), then what is left must be nothing or only "I want information": a course or a city is content
  let guard = 0;
  while (GREET_WORDS.test(t) && guard < 4) {
    t = t.replace(GREET_WORDS, "").trim();
    guard += 1;
  }
  return !t || INTEREST_ONLY.test(t);
};

// The first message of the agent, written by the system (a model would spend tokens to say the same thing every time): it welcomes the
// person, mentions what is already known and asks only the next thing that is missing.
export const openingText = (slots: Slots, first: string, returning: boolean): string => {
  const name = first ? `, ${first}` : "";
  const hasCourse = !!(slots.courseName || slots.courseId);
  const hasCity = !!(slots.city || slots.poloId);
  const hasEntry = !!slots.entryType && slots.entryType !== "unknown";
  const ask = !hasCourse
    ? "Qual curso você tem interesse?"
    : !hasCity
      ? "Em qual cidade você mora? Assim eu já te mostro o polo mais perto."
      : !hasEntry
        ? "Você vai começar a primeira graduação ou já cursou (ou cursa) outra faculdade?"
        : "Em que posso te ajudar agora?";
  const course = hasCourse ? String(slots.courseName || "") : "";
  if (returning) {
    return `Oi${name}! Que bom falar com você de novo. 😊${course ? ` Da última vez conversamos sobre ${course}.` : ""} ${hasCourse && hasCity && hasEntry ? "Em que posso te ajudar agora?" : ask}`;
  }
  return `Olá${name}! 👋 Aqui é o assistente virtual da Cruzeiro do Sul Virtual.${course ? ` Vi que você tem interesse em ${course}.` : ""} ${ask}`;
};

// the fields a stage asks for are filled when each one has a value in the state of the lead
export const stageFieldsDone = (fields: Array<{ key: string; required: boolean }>, slots: Slots): boolean => {
  const required = fields.filter(f => f.required);
  if (!required.length) return false;
  return required.every(f => {
    const v = slots[f.key];
    if (f.key === "entryType") return !!v && v !== "unknown";
    if (f.key === "city") return !!(slots.city || slots.poloId);
    if (f.key === "courseName") return !!(slots.courseName || slots.courseId);
    return v !== undefined && v !== null && v !== "" && v !== false;
  });
};

// the model said "no interest": it only counts when the person really said it
export const confirmsNoInterest = (text: string): boolean => NO_INTEREST.some(r => r.test(plain(text)));

// the subjects of the knowledge base a message is about: the passages come from there, not from every document
export const topicsOf = (text: string): string[] => {
  const t = plain(text);
  const topics: string[] = [];
  if (/(plataforma|ambiente virtual|portal do aluno|aplicativo|app\b|blackboard|moodle)/.test(t)) topics.push("institutional/platform");
  if (/(tutoria|tutor|tutora|ambientacao|primeiro acesso)/.test(t)) topics.push("institutional/tutoring");
  if (/(professor|professores|docente|corpo docente|mestre|doutor|titulacao)/.test(t)) topics.push("institutional/faculty");
  if (/(estagio remunerado|estagiar|estagio pago|remunerado)/.test(t)) topics.push("institutional/internship");
  if (/\b(mec|portaria|decreto|diretriz|semipresencial|100% ?ead|presencial)\b/.test(t)) topics.push("institutional/mec");
  if (/(reconhec|autorizad|nota do mec|credenciad|valido|validade do diploma|diploma)/.test(t)) topics.push("institutional/recognition");
  if (/(matricula|documentos?|inscricao|como (faco|funciona) (pra|para) (me )?matricular)/.test(t)) topics.push("institutional/enrollment");
  return topics;
};

// ---------------------------------------------------------------- score, temperature, next action
const INFO_INTENTS = ["course_duration", "course_modality", "mec", "curriculum", "internship", "paid_internship", "tcc", "transfer", "second_degree", "analysis"];
const HOT_INTENTS = ["price", "enrollment", "proposal"];

const seenOf = (slots: Slots): string[] => String(slots.intentsSeen || "").split(",").map(s => s.trim()).filter(Boolean);

export interface TurnFacts {
  intent?: string | null;
  // the person wrote (not a message sent by the system)
  replied?: boolean;
  // a tool of the turn was used (the AI looked something up)
  tools?: string[];
  followUp?: boolean;
  noInterest?: boolean;
}

const POINTS: Record<string, number> = { replied: 5, course: 10, entry: 10, city: 5, curriculum: 5, internship: 5, modality: 5, price: 20, enrollment: 30, proposal: 30 };

// the points of each fact count once: the ledger is kept in the slots
export const scoreOf = (slots: Slots, ready: boolean, intent?: string | null): { score: number; ledger: string[] } => {
  const ledger = new Set(seenOf(slots));
  const award = (k: string) => ledger.add(`pts:${k}`);
  if (slots.lastInboundAt) award("replied");
  if (slots.courseId || slots.courseName) award("course");
  if (slots.entryType && slots.entryType !== "unknown") award("entry");
  if (slots.city || slots.poloId) award("city");
  if (slots.gradeAsked || slots.gradeSent || intent === "curriculum") award("curriculum");
  if (intent === "internship" || intent === "paid_internship") award("internship");
  if (intent === "course_modality" || intent === "mec") award("modality");
  if (intent === "price") award("price");
  if (intent === "enrollment") award("enrollment");
  if (intent === "proposal" || ready) award("proposal");
  let score = 0;
  ledger.forEach(k => { if (k.startsWith("pts:")) score += POINTS[k.slice(4)] || 0; });
  return { score: Math.min(100, score), ledger: [...ledger] };
};

export const temperatureOf = (slots: Slots, ready: boolean): "cold" | "warm" | "hot" => {
  const seen = seenOf(slots);
  if (ready || HOT_INTENTS.some(i => seen.includes(i))) return "hot";
  if (INFO_INTENTS.some(i => seen.includes(i)) || slots.courseId || slots.gradeSent || slots.courseExplained) return "warm";
  return "cold";
};

const needsTranscript = (slots: Slots): boolean => slots.entryType === "transfer" || slots.entryType === "second_degree";

export const nextActionOf = (s: CommercialState, facts: { human?: boolean; lost?: boolean } = {}): string => {
  const slots = s.slots;
  if (facts.lost) return "close_lost";
  if (facts.human) return "human_service";
  if (s.readyForProposal) return "generate_proposal";
  if (s.followUpReason && s.followUpAt) return "follow_up";
  if (slots.analysisStatus === "completed" && !slots.analysisExplained) return "explain_analysis";
  if (slots.analysisStatus === "requested" || slots.analysisStatus === "in_progress") return "wait_analysis";
  if (needsTranscript(slots) && !slots.hasTranscript) return "wait_transcript";
  if (needsTranscript(slots) && slots.hasTranscript && slots.analysisStatus === "waiting_document") return "request_analysis";
  if (!slots.city && !slots.poloId) return "identify_city";
  if (!slots.entryType || slots.entryType === "unknown") return "identify_entry_type";
  if (!slots.courseExplained) return "present_course";
  if (!slots.modalityExplained || (slots.mecImpacted && !slots.mecExplained)) return "explain_modality";
  if (slots.gradeAsked && !slots.gradeSent) return "send_curriculum";
  return "answer_objection";
};

// ---------------------------------------------------------------- the funnel
// the keys of the commercial funnel and how far each one is (an automatic move only goes forward)
export const STAGE_RANK: Record<string, number> = {
  new_lead: 0, contact_started: 1, in_service: 2, follow_up: 2, no_response: 2, human_service: 2, qualified: 3, waiting_transcript: 4,
  curricular_analysis: 5, analysis_done: 6, ready_for_proposal: 7, proposal: 8, enrollment_in_progress: 9, enrolled: 10
};
// from here on a person owns the lead: the agent no longer moves it
const OWNED = ["proposal", "enrollment_in_progress", "enrolled", "no_interest", "lost"];

export const targetStageKey = (s: CommercialState, facts: TurnFacts & { human?: boolean; firstContactSent?: boolean }): string | null => {
  const slots = s.slots;
  if (facts.noInterest) return "no_interest";
  if (facts.human) return "human_service";
  if (s.readyForProposal) return "ready_for_proposal";
  if (facts.followUp) return "follow_up";
  if (slots.analysisStatus === "completed") return "analysis_done";
  if (slots.analysisStatus === "requested" || slots.analysisStatus === "in_progress") return "curricular_analysis";
  const qualified = !!(slots.courseId || slots.courseName) && !!(slots.city || slots.poloId) && !!slots.entryType && slots.entryType !== "unknown" && !!slots.courseExplained;
  if (qualified && needsTranscript(slots) && !slots.hasTranscript) return "waiting_transcript";
  if (qualified) return "qualified";
  if (facts.replied || slots.lastInboundAt) return "in_service";
  if (facts.firstContactSent || slots.lastOutboundAt) return "contact_started";
  return null;
};

export const canAutoMove = (current: string | null, target: string | null): boolean => {
  if (!target) return false;
  // an unmapped column (a person put the lead there): respected
  if (!current) return false;
  if (current === target) return false;
  if (OWNED.includes(current)) return false;
  if (current === "human_service") return false;
  // lateral states can be entered from any column before the proposal; the lead coming back leaves them going forward
  if (["human_service", "follow_up", "no_interest", "no_response"].includes(target)) return true;
  if (["follow_up", "no_response"].includes(current)) return (STAGE_RANK[target] ?? -1) >= 2;
  return (STAGE_RANK[target] ?? -1) > (STAGE_RANK[current] ?? 99);
};

// ---------------------------------------------------------------- notes and handoff (no model)
export const ENTRY_LABEL: Record<string, string> = { first_degree: "Primeira graduação", transfer: "Transferência", second_degree: "Segunda graduação", unknown: "Tipo de ingresso não informado" };
const TEMP_LABEL: Record<string, string> = { cold: "Frio", warm: "Morno", hot: "Quente" };
const INTENT_LABEL: Record<string, string> = {
  greeting: "Cumprimentou", course_duration: "Perguntou a duração", course_modality: "Perguntou a modalidade", mec: "Perguntou sobre o MEC", curriculum: "Pediu a grade",
  internship: "Perguntou do estágio", paid_internship: "Perguntou do estágio remunerado", tcc: "Perguntou do TCC", platform: "Perguntou da plataforma", tutoring: "Perguntou da tutoria",
  faculty: "Perguntou dos professores", recognition: "Perguntou do reconhecimento", transfer: "Falou de transferência", second_degree: "Falou de segunda graduação",
  analysis: "Falou da análise curricular", price: "Perguntou valor", enrollment: "Quer se matricular", proposal: "Pediu a proposta", human: "Pediu uma pessoa",
  follow_up: "Vai pensar", no_interest: "Sem interesse", objection: "Levantou uma objeção", unknown: "Perguntou algo sem resposta na base", other: "Conversou"
};
export const NEXT_LABEL: Record<string, string> = {
  identify_entry_type: "Descobrir o tipo de ingresso", identify_city: "Descobrir a cidade", present_course: "Apresentar o curso", explain_modality: "Explicar a modalidade",
  send_curriculum: "Enviar a grade", wait_transcript: "Aguardar o histórico", request_analysis: "Solicitar a análise curricular", wait_analysis: "Aguardar a análise",
  explain_analysis: "Explicar o resultado da análise", answer_objection: "Tratar dúvidas e objeções", generate_proposal: "Gerar a proposta", follow_up: "Retomar o contato",
  human_service: "Atendimento humano", close_lost: "Encerrar (sem interesse)"
};
export const intentLabel = (i?: string | null): string => (i ? INTENT_LABEL[i] || i : "—");

const yesNo = (v: any): string => (v ? "Sim" : "Não");

export const noteOf = (s: CommercialState): string => {
  const x = s.slots;
  const lines = [
    `Lead interessado em ${x.courseName || "curso a definir"}.`,
    `${ENTRY_LABEL[x.entryType || "unknown"]}.`,
    x.city || x.poloName ? `Cidade: ${x.city || x.poloName}${x.poloName && x.city ? ` · Polo: ${x.poloName}` : ""}.` : null,
    x.courseExplained ? "Curso apresentado." : null,
    x.modalityExplained ? "Modalidade explicada." : null,
    x.mecExplained ? "Mudança do MEC explicada." : null,
    x.gradeSent ? "Grade enviada." : null,
    x.internshipExplained ? "Estágio explicado." : null,
    x.tutoringExplained ? "Tutoria explicada." : null,
    x.analysisStatus && x.analysisStatus !== "not_applicable" ? `Análise curricular: ${{ waiting_document: "aguardando histórico", requested: "solicitada", in_progress: "em andamento", completed: "concluída" }[x.analysisStatus as string] || x.analysisStatus}.` : null,
    x.mainObjection ? `Objeção principal: ${x.mainObjection}.` : null,
    x.mainQuestion ? `Dúvida principal: ${x.mainQuestion}.` : null
  ];
  return lines.filter(Boolean).join("\n");
};

// the short stable hash of a text (to write a note only when it changed)
export const hashOf = (text: string): string => {
  let h = 5381;
  for (let i = 0; i < text.length; i += 1) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
};

export const briefOf = (s: CommercialState, extra: { stageName?: string | null } = {}): string => {
  const x = s.slots;
  const line = (label: string, value: any) => `${label}:\n${value === undefined || value === null || value === "" ? "Não informado" : value}`;
  return [
    s.readyForProposal ? "LEAD PRONTO PARA PROPOSTA" : "RESUMO DO ATENDIMENTO COM IA",
    "",
    `Nome: ${x.leadName || "Não informado"}`,
    `Telefone: ${x.phone || "Não informado"}`,
    `Cidade: ${x.city || "Não informada"}`,
    `Curso: ${x.courseName || "Não definido"}`,
    `Polo: ${x.poloName || "Não definido"}`,
    "",
    line("Ingresso", ENTRY_LABEL[x.entryType || "unknown"]),
    line("Duração", x.courseDurationText || (x.courseDurationSemesters ? `${x.courseDurationSemesters} semestres` : null)),
    line("Modalidade", x.courseModality),
    line("MEC explicado", x.mecImpacted === false ? "Não se aplica" : yesNo(x.mecExplained)),
    line("Modalidade explicada", yesNo(x.modalityExplained)),
    line("Grade enviada", yesNo(x.gradeSent)),
    line("Estágio", x.internshipExplained ? x.internshipSummary || "Explicado" : "Não explicado"),
    line("Tutoria", x.tutoringExplained ? "Explicada" : "Não explicada"),
    x.analysisStatus && x.analysisStatus !== "not_applicable"
      ? line("Análise curricular", [x.analysisStatus, x.semesterEntry ? `ingresso no ${x.semesterEntry}º semestre` : null, x.estimatedCompletion ? `previsão ${x.estimatedCompletion}` : null].filter(Boolean).join(" · "))
      : null,
    line("Objeção principal", x.mainObjection),
    line("Dúvida principal", x.mainQuestion),
    x.unknownQuestion ? line("Pergunta sem resposta na base", x.unknownQuestion) : null,
    "",
    line("Temperatura", TEMP_LABEL[s.temperature] || s.temperature),
    line("Score", s.commercialScore),
    line("Última intenção", intentLabel(s.lastIntent)),
    line("Próxima ação", s.nextAction ? NEXT_LABEL[s.nextAction] || s.nextAction : null),
    extra.stageName ? line("Coluna do CRM", extra.stageName) : null,
    s.summary ? `\nResumo:\n${s.summary}` : null
  ]
    .filter(v => v !== null)
    .join("\n");
};
