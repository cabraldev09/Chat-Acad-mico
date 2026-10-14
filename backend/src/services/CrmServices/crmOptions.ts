export const CRM_OPTIONS = {
  sources: [
    "WhatsApp",
    "Instagram",
    "Facebook",
    "Telegram",
    "Site / formulário",
    "Google",
    "Indicação",
    "Evento / feira",
    "Visita presencial",
    "Ligação",
    "Importação",
    "Outro"
  ],
  modalities: ["Presencial", "EAD", "Semipresencial", "Flex"],
  admissionTypes: [
    "Vestibular / prova online",
    "ENEM",
    "Transferência externa",
    "Portador de diploma (2ª graduação)",
    "Aproveitamento de estudos",
    "Outro"
  ],
  // forms of admission where the candidate may enter after the 1st semester
  admissionNeedsSemester: [
    "Transferência externa",
    "Portador de diploma (2ª graduação)",
    "Aproveitamento de estudos"
  ],
  shifts: ["Manhã", "Tarde", "Noite", "Flexível (EAD)"],
  // first item = most ready to enrol (drives the lead score)
  decisionTimelines: ["Quer matricular agora", "Decide esta semana", "Decide este mês", "Pesquisando, sem prazo"],
  motivations: [
    "Primeira graduação",
    "Mudança de carreira",
    "Promoção ou crescimento",
    "Exigência do trabalho",
    "Segunda graduação",
    "Realização pessoal"
  ],
  financing: ["Bolsa da instituição", "FIES", "ProUni", "Financiamento próprio", "Pagamento particular", "Ainda não sabe"],
  educationLevels: ["Ensino médio cursando", "Ensino médio completo", "Superior cursando", "Superior completo", "Técnico"],
  lostReasons: [
    "Preço / mensalidade",
    "Escolheu outra instituição",
    "Sem resposta",
    "Horário incompatível",
    "Curso indisponível",
    "Desistiu de estudar",
    "Sem documentação",
    "Reprovou / não elegível",
    "Outro"
  ],
  taskTypes: ["ligar", "whatsapp", "email", "visita", "proposta", "documentos", "outro"]
};

export const channelSource = (channel?: string): string =>
  ({
    whatsapp: "WhatsApp",
    whatsapp_cloud: "WhatsApp",
    telegram: "Telegram",
    messenger: "Facebook",
    instagram: "Instagram",
    webchat: "Site / formulário"
  } as Record<string, string>)[channel || ""] || "Outro";
