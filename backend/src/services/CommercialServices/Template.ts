import { Graph } from "../FlowServices/Graph";
import { MEC_DOC } from "./MecDoc";
import { INSTITUTION_DOCS } from "./InstitutionDocs";
import { build } from "../FlowServices/Templates";

// The ready agent "Comercial — Graduação": it welcomes the lead, finds out course, city and kind of entry, presents the course with data
// from the system, clears doubts, asks for the transcript of who transfers, explains the curricular analysis and, when the person
// asks about price, scholarship or enrollment, hands over to a consultant with everything that was said. The column of the CRM, the
// tasks, the notes, the temperature and the score are kept by rules of the system (see Hook.ts), not by the model.
export const COMMERCIAL_TEMPLATE_KEY = "graduacao_comercial_cruzeiro";

export const COMMERCIAL_PERSONA = {
  systemPrompt:
    "Você é um consultor virtual da Cruzeiro do Sul Virtual especializado em graduação. Atenda de forma humana, consultiva, objetiva e comercial. Nunca invente informações acadêmicas, financeiras, institucionais ou regulatórias. Dados objetivos devem vir das ferramentas ou da base aprovada. Conduza naturalmente o lead ao próximo passo e transfira para uma pessoa quando necessário.",
  tone: "Próximo, educado e profissional, como um consultor que conhece quem estuda e trabalha ao mesmo tempo. Simples e direto, sem jargão. Mensagens em blocos curtos, no máximo um emoji por mensagem.",
  rules: "Uma pergunta principal por mensagem. Respostas em blocos curtos (1 ou 2 frases cada), nunca um textão. Reconheça o que a pessoa disse antes de responder. Não pergunte o que já está nos dados do lead. Depois de esclarecer algo, conduza para o próximo passo.",
  forbidden:
    "Nunca informe valor de mensalidade, bolsa, desconto, data de início ou cronograma que não venham de uma ferramenta. Nunca cite percentuais do MEC que a ferramenta não devolveu. Nunca prometa aproveitamento de disciplinas antes da análise curricular.",
  handoffMessage: "Claro! Vou chamar um consultor para continuar com você. Um momento, por favor.",
  unknownMessage: "Essa informação eu prefiro confirmar para não te passar nada incorreto. Vou encaminhar para o consultor verificar certinho para você."
};

// Approved texts the agent may use. Only what the institution dictated is here; the rest (faculty, recognition...) is filled by the team
// in the knowledge base, and until then the agent says it will confirm instead of guessing.
export const COMMERCIAL_KB: Array<{ title: string; content: string; topic: string; keywords?: string }> = [
  {
    title: "Tutoria",
    topic: "institutional/tutoring",
    keywords: "tutoria, tutor, ambientação, primeiro acesso",
    content:
      "Após a matrícula, a tutoria entra em contato para fazer sua ambientação, orientar o primeiro acesso e acompanhar você durante o curso. A tutoria pode orientar sobre plataforma, acesso, disciplinas, organização da grade, atividades, provas, prazos e orientações acadêmicas. Mesmo estudando a distância, você não fica sozinho no processo."
  },
  {
    title: "Plataforma de estudo",
    topic: "institutional/platform",
    keywords: "plataforma, ambiente virtual, aulas, materiais",
    content:
      "O ambiente virtual reúne suas disciplinas, materiais, atividades, avaliações e demais recursos acadêmicos. Não cite o nome de ferramentas nem compare com outras instituições, a menos que a equipe tenha confirmado isso nesta base."
  },
  {
    title: "Estágio remunerado",
    topic: "institutional/internship",
    keywords: "estágio remunerado, estagiar, estágio pago",
    content:
      "Você pode buscar oportunidades de estágio remunerado durante a graduação. Quando encontrar uma oportunidade, a tutoria ou o setor responsável orienta sobre a documentação e a formalização. O estágio remunerado não substitui automaticamente o estágio obrigatório do curso."
  },
  MEC_DOC,
  ...INSTITUTION_DOCS,
  {
    title: "Como tratar objeções",
    topic: "institutional/objection",
    keywords: "objeção, caro, tempo, confiança, golpe, concorrente, outra faculdade, família, distância, ead, dúvida",
    content: [
      "Guia para conduzir quem hesita. Reconheça o sentimento em uma frase, responda com o que a base e as ferramentas trazem e volte a conduzir para o próximo passo. Nunca cite valores, descontos ou bolsas, nunca critique outra instituição e nunca prometa resultado.",
      "- Preço ou \"é caro\": entenda a preocupação e explique que a melhor condição depende da situação da pessoa e do polo; quem apresenta é o consultor do polo. Ofereça encaminhar.",
      "- Falta de tempo: o estudo é organizado na plataforma, com a tutoria acompanhando desde o primeiro acesso (use o texto aprovado da tutoria); pergunte qual turno ou rotina funciona melhor.",
      "- Confiança, golpe ou reconhecimento: use somente o texto aprovado da base; se não houver, diga que o consultor confirma os documentos oficiais da instituição.",
      "- Outra instituição: não compare nem critique; mostre o que este curso oferece (ferramentas) e convide a comparar a proposta com o consultor.",
      "- Família ou decisão em conjunto: ofereça uma conversa com o consultor em um horário em que a família possa participar.",
      "- Distância ou deslocamento: mostre o polo mais perto (listar_polos) e como funciona o estudo na plataforma.",
      "- Dúvida sobre EAD ou semipresencial: explique como se estuda com a plataforma e a tutoria; regras de modalidade só com buscar_regra_modalidade."
    ].join("\n")
  },
  {
    title: "Análise curricular",
    topic: "institutional/analysis",
    keywords: "análise curricular, histórico, aproveitamento, dispensa, transferência, segunda graduação",
    content:
      "Com o seu histórico conseguimos solicitar uma análise curricular para verificar exatamente quais disciplinas poderão ser dispensadas. O resultado depende da análise: nunca prometa aproveitamento antes dela. Previsão de conclusão só pode ser dita como previsão e quando houver dado oficial no resultado."
  }
];

const stage = (d: any) => ({ useKnowledge: true, maxTurns: 12, tools: [], http: [], outcomes: [], fields: [], instructions: "", opening: "", hooks: ["commercial"], historyTurns: 6, ...d });

// the exits that every conversation stage can take for a commercial reason
const REASONS = [
  { id: "proposta", label: "Quer proposta", when: "quando a pessoa perguntar valor, bolsa, desconto ou matrícula, ou pedir a proposta" },
  { id: "follow_up", label: "Vai pensar", when: "quando a pessoa pedir um tempo para pensar ou disser que retorna depois" },
  { id: "sem_interesse", label: "Sem interesse", when: "quando a pessoa disser claramente que não tem mais interesse" }
];

export const commercialGraph = (): Graph =>
  build({
    nodes: [
      ["start", "start", {}],
      ["receber", "commercial", { op: "ensure_lead", title: "Receber lead", source: "Agente de IA" }],
      ["retorno", "condition", {
        title: "Lead novo ou de volta?",
        rules: [
          { id: "historico", label: "Falta o histórico", all: [{ field: "var:entryType", op: "in", value: "transfer,second_degree" }, { field: "var:analysisStatus", op: "eq", value: "waiting_document" }, { field: "var:courseExplained", op: "eq", value: "true" }] },
          { id: "voltou", label: "Já conversou antes", all: [{ field: "var:courseExplained", op: "eq", value: "true" }] }
        ]
      }],
      ["qualificar", "stage", stage({
        title: "Qualificar interesse",
        objective: "Descobrir o curso de interesse, a cidade e se é primeira graduação, transferência ou segunda graduação.",
        instructions:
          "Pergunte só o que ainda falta. Transferência: pergunte de qual curso e instituição vem. Segunda graduação: pergunte qual curso já concluiu. Quando tiver os três dados, confirme em uma frase. Primeira graduação: pergunte se pode explicar como funciona o curso. Transferência ou segunda graduação: explique que, com o histórico acadêmico em PDF, dá para solicitar uma análise curricular e peça o arquivo.",
        fields: [
          { key: "courseName", label: "Curso de interesse", type: "text", required: true },
          { key: "city", label: "Cidade", type: "text", required: true },
          { key: "entryType", label: "Tipo de ingresso", type: "choice", required: true, options: ["first_degree", "transfer", "second_degree"] }
        ],
        tools: ["buscar_curso", "listar_polos"],
        maxTurns: 8,
        outcomes: REASONS
      })],
      ["ingresso", "condition", {
        title: "Identificar tipo de ingresso",
        rules: [{ id: "historico", label: "Transferência ou segunda graduação", all: [{ field: "var:entryType", op: "in", value: "transfer,second_degree" }] }]
      }],
      ["apresentar", "stage", stage({
        title: "Apresentar curso",
        quiet: true,
        objective: "Apresentar o curso (duração, formato e como se estuda) e conduzir para o próximo passo.",
        instructions:
          "Use buscar_curso antes de falar de duração ou formato; o formato vem da oferta real, nunca do nome do curso. Se o curso for impactado pelo MEC, use buscar_regra_modalidade. Termine perguntando se a pessoa quer ver a grade ou se tem alguma dúvida.",
        fields: [{ key: "courseExplained", label: "Curso apresentado", type: "text", required: true }],
        tools: ["buscar_curso", "buscar_regra_modalidade", "listar_polos"],
        maxTurns: 6,
        outcomes: REASONS
      })],
      ["orientar", "stage", stage({
        title: "Orientação acadêmica e objeções",
        quiet: true,
        objective: "Tirar as dúvidas do curso e tratar objeções até a pessoa querer avançar para a proposta.",
        instructions:
          "Duração e formato: buscar_curso. MEC e práticas: buscar_regra_modalidade. Grade: buscar_grade (envie o PDF com enviar_material se pedirem). Estágio e TCC: buscar_estagio ou buscar_grade. Plataforma, tutoria, docentes, reconhecimento e matrícula: consultar_conhecimento. Sem dado, diga que vai confirmar; nunca chute. Após responder, conduza: ofereça a grade, pergunte se ficou claro ou ofereça encaminhar para ver a melhor condição de bolsa com um consultor. Se a pessoa disser um dia e horário para falar com o consultor, use agendar_contato e confirme com o texto devolvido.",
        tools: ["buscar_curso", "buscar_regra_modalidade", "buscar_grade", "buscar_estagio", "listar_polos", "consultar_conhecimento", "enviar_material", "consultar_analise_curricular", "agendar_contato"],
        maxTurns: 30,
        outcomes: [...REASONS, { id: "enviou_historico", label: "Enviou o histórico", when: "quando a pessoa enviar o histórico acadêmico em PDF (a mensagem aparece como [arquivo enviado: nome.pdf])" }]
      })],
      ["pedir_historico", "stage", stage({
        title: "Solicitar histórico",
        quiet: true,
        objective: "Explicar que a análise curricular mostra quais disciplinas poderão ser dispensadas e pedir o histórico acadêmico em PDF.",
        instructions:
          "Diga que, com o histórico, é possível solicitar uma análise curricular para verificar exatamente quais disciplinas poderão ser dispensadas. Nunca prometa aproveitamento. Se a mensagem da pessoa for [arquivo enviado: nome.pdf], ela enviou o histórico em PDF.",
        tools: ["consultar_analise_curricular"],
        maxTurns: 8,
        outcomes: [
          ...REASONS,
          { id: "enviou_historico", label: "Enviou o histórico", when: "quando a pessoa enviar o histórico acadêmico em PDF (a mensagem aparece como [arquivo enviado: nome.pdf])" },
          { id: "sem_historico", label: "Sem histórico agora", when: "quando a pessoa disser que não tem o histórico agora" }
        ]
      })],
      ["analise", "commercial", { op: "start_analysis", title: "Análise curricular" }],
      ["analise_ok", "condition", {
        title: "A análise já tem resultado?",
        rules: [
          { id: "concluida", label: "Concluída", all: [{ field: "var:analysisStatus", op: "eq", value: "completed" }] },
          { id: "andamento", label: "Em andamento", all: [{ field: "var:analysisStatus", op: "in", value: "requested,in_progress" }] }
        ]
      }],
      ["resultado", "stage", stage({
        title: "Explicar resultado",
        objective: "Explicar com simplicidade o resultado da análise curricular e conduzir para o próximo passo.",
        instructions:
          "Use consultar_analise_curricular. Diga o semestre de ingresso e quantas disciplinas foram dispensadas e quantas restam, em linguagem simples, e que algumas disciplinas aparecem porque as grades são diferentes. Previsão de conclusão só como previsão e só se vier no resultado.",
        fields: [{ key: "analysisExplained", label: "Resultado explicado", type: "text", required: true }],
        tools: ["consultar_analise_curricular", "buscar_grade", "buscar_curso"],
        maxTurns: 6,
        outcomes: REASONS
      })],
      ["andamento", "message", { text: "Recebi o seu histórico! A análise está em andamento e, assim que a equipe concluir, eu te explico o resultado por aqui. 😊" }],
      ["sem_arquivo", "message", { text: "Ainda não localizei o arquivo do histórico por aqui. Quando puder, me envie o PDF e eu já inicio a análise." }],
      ["fim_andamento", "end", { title: "Aguardar a análise", resume: true }],
      ["fim_orientacao", "end", { title: "Conversa concluída", resume: true }],
      ["crm_aguardando", "commercial", { op: "sync_stage", stageKey: "waiting_transcript", title: "CRM: Aguardando histórico", reason: "histórico ainda não enviado" }],
      ["tarefa_historico", "commercial", { op: "task", title: "Aguardar histórico acadêmico", minutes: 2880 }],
      ["fim_historico", "end", { resume: true, text: "Sem problema! Quando tiver o histórico em mãos, é só me enviar por aqui que eu inicio a análise." }],

      // handoff for the proposal
      ["handoff_proposta", "commercial", { op: "handoff_brief", title: "Preparar handoff" }],
      ["crm_pronto", "commercial", { op: "sync_stage", stageKey: "ready_for_proposal", title: "CRM: Pronto para proposta", reason: "pediu valor, bolsa ou matrícula" }],
      ["tarefa_proposta", "commercial", { op: "task", title: "Gerar e apresentar proposta", minutes: 60 }],
      ["comercial", "transfer", { to: "polo_sales", title: "Transferir para comercial" }],

      // handoff to a person
      ["handoff_humano", "commercial", { op: "handoff_brief", title: "Preparar handoff (pessoa)" }],
      ["crm_humano", "commercial", { op: "sync_stage", stageKey: "human_service", title: "CRM: Atendimento humano", reason: "pediu uma pessoa ou a pergunta não tem fonte" }],
      ["humano", "transfer", { to: "polo_sales", title: "Transferir para atendente" }],

      // postponed or lost
      ["crm_followup", "commercial", { op: "sync_stage", stageKey: "follow_up", title: "CRM: Follow-up", reason: "pediu um tempo para pensar" }],
      ["fim_followup", "end", { title: "Aguardar retorno", resume: true }],
      ["crm_perdido", "commercial", { op: "sync_stage", stageKey: "no_interest", title: "CRM: Sem interesse", reason: "disse que não tem interesse" }],
      ["fim_perdido", "end", { title: "Encerrar" }]
    ],
    links: [
      ["start", "receber"], ["receber", "retorno"],
      ["retorno", "pedir_historico", "historico"], ["retorno", "orientar", "voltou"], ["retorno", "qualificar", "else"],
      ["qualificar", "ingresso", "done"], ["ingresso", "pedir_historico", "historico"], ["ingresso", "apresentar", "else"],
      ["apresentar", "orientar", "done"],
      ["pedir_historico", "analise", "enviou_historico"], ["pedir_historico", "crm_aguardando", "sem_historico"],
      ["orientar", "analise", "enviou_historico"], ["orientar", "fim_orientacao", "done"], ["pedir_historico", "analise", "done"],
      ["analise", "analise_ok"], ["analise_ok", "resultado", "concluida"], ["analise_ok", "andamento", "andamento"], ["andamento", "fim_andamento"], ["analise_ok", "sem_arquivo", "else"],
      ["sem_arquivo", "crm_aguardando"], ["crm_aguardando", "tarefa_historico"], ["tarefa_historico", "fim_historico"],
      ["resultado", "orientar", "done"],
      ["qualificar", "handoff_proposta", "proposta"], ["apresentar", "handoff_proposta", "proposta"], ["orientar", "handoff_proposta", "proposta"],
      ["pedir_historico", "handoff_proposta", "proposta"], ["resultado", "handoff_proposta", "proposta"],
      ["handoff_proposta", "crm_pronto"], ["crm_pronto", "tarefa_proposta"], ["tarefa_proposta", "comercial"],
      ["qualificar", "handoff_humano", "human"], ["apresentar", "handoff_humano", "human"], ["orientar", "handoff_humano", "human"],
      ["pedir_historico", "handoff_humano", "human"], ["resultado", "handoff_humano", "human"],
      ["orientar", "handoff_humano", "off"], ["orientar", "handoff_humano", "limit"],
      ["handoff_humano", "crm_humano"], ["crm_humano", "humano"],
      ["qualificar", "crm_followup", "follow_up"], ["apresentar", "crm_followup", "follow_up"], ["orientar", "crm_followup", "follow_up"],
      ["pedir_historico", "crm_followup", "follow_up"], ["resultado", "crm_followup", "follow_up"], ["crm_followup", "fim_followup"],
      ["qualificar", "crm_perdido", "sem_interesse"], ["apresentar", "crm_perdido", "sem_interesse"], ["orientar", "crm_perdido", "sem_interesse"],
      ["pedir_historico", "crm_perdido", "sem_interesse"], ["resultado", "crm_perdido", "sem_interesse"], ["crm_perdido", "fim_perdido"]
    ]
  });
