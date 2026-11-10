// How the commercial state of a lead (kept by the AI agent of graduation) is shown to people: the same words everywhere
// (card of the CRM, drawer of the lead, conversation panel, simulator, metrics).
export const TEMP_LABEL = { cold: "Frio", warm: "Morno", hot: "Quente" };
export const TEMP_COLOR = { cold: "#64748b", warm: "#d97706", hot: "#dc2626" };
export const ENTRY_LABEL = { first_degree: "Primeira graduação", transfer: "Transferência", second_degree: "Segunda graduação", unknown: "Tipo de ingresso não informado" };
export const ANALYSIS_LABEL = { not_applicable: "Não se aplica", waiting_document: "Aguardando o histórico", requested: "Solicitada", in_progress: "Em andamento", completed: "Concluída" };
export const NEXT_LABEL = {
  identify_entry_type: "Descobrir o tipo de ingresso", identify_city: "Descobrir a cidade", present_course: "Apresentar o curso", explain_modality: "Explicar a modalidade",
  send_curriculum: "Enviar a grade", wait_transcript: "Aguardar o histórico", request_analysis: "Solicitar a análise curricular", wait_analysis: "Aguardar a análise",
  explain_analysis: "Explicar o resultado da análise", answer_objection: "Tratar dúvidas e objeções", generate_proposal: "Gerar a proposta", follow_up: "Retomar o contato",
  human_service: "Atendimento humano", close_lost: "Encerrar (sem interesse)",
};
export const INTENT_LABEL = {
  greeting: "Cumprimentou", course_duration: "Perguntou a duração", course_modality: "Perguntou a modalidade", mec: "Perguntou sobre o MEC", curriculum: "Pediu a grade",
  internship: "Perguntou do estágio", paid_internship: "Perguntou do estágio remunerado", tcc: "Perguntou do TCC", platform: "Perguntou da plataforma", tutoring: "Perguntou da tutoria",
  faculty: "Perguntou dos professores", recognition: "Perguntou do reconhecimento", transfer: "Falou de transferência", second_degree: "Falou de segunda graduação",
  analysis: "Falou da análise curricular", price: "Perguntou valor", enrollment: "Quer se matricular", proposal: "Pediu a proposta", human: "Pediu uma pessoa",
  follow_up: "Vai pensar", no_interest: "Sem interesse", objection: "Levantou uma objeção", unknown: "Perguntou algo sem resposta na base", other: "Conversou",
};
// the names of the slots in the words of the team
export const SLOT_LABEL = {
  leadName: "Nome", phone: "Telefone", email: "E-mail", city: "Cidade", poloName: "Polo", courseName: "Curso", entryType: "Tipo de ingresso", previousCourse: "Curso anterior",
  previousInstitution: "Instituição anterior", hasTranscript: "Enviou o histórico", courseDegree: "Grau", courseDurationText: "Duração", courseModality: "Modalidade", mecImpacted: "Impactado pelo MEC",
  courseExplained: "Curso apresentado", modalityExplained: "Modalidade explicada", mecExplained: "MEC explicado", gradeSent: "Grade enviada", internshipExplained: "Estágio explicado",
  tutoringExplained: "Tutoria explicada", platformExplained: "Plataforma explicada", facultyExplained: "Docentes explicados", analysisStatus: "Análise curricular", semesterEntry: "Semestre de ingresso",
  subjectsWaived: "Disciplinas dispensadas", subjectsRemaining: "Disciplinas restantes", mainObjection: "Objeção principal", mainQuestion: "Dúvida principal", unknownQuestion: "Pergunta sem resposta",
  temperature: "Temperatura", commercialScore: "Pontuação", nextAction: "Próxima ação", readyForProposal: "Pronto para proposta",
};

export const slotValue = (key, v) => {
  if (v === true) return "Sim";
  if (v === false) return "Não";
  if (v === null || v === undefined || v === "") return "—";
  if (key === "entryType") return ENTRY_LABEL[v] || v;
  if (key === "analysisStatus") return ANALYSIS_LABEL[v] || v;
  if (key === "temperature") return TEMP_LABEL[v] || v;
  if (key === "nextAction") return NEXT_LABEL[v] || v;
  return String(v);
};
