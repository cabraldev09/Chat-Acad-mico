import { Graph } from "../FlowServices/Graph";
import { build } from "../FlowServices/Templates";

// The ready agent "Atendimento": for the person who already is a student (or wants to be) and needs a sector. It does not answer the
// academic questions itself: it understands in a few questions who the person is and what is needed, and sends the conversation to the
// right team of the polo: tutoring (platform, activities, exams, deadlines), secretary (documents, declarations, transcript, enrollment
// paperwork) or the commercial team (who wants to enroll).
export const SERVICE_TEMPLATE_KEY = "atendimento_encaminhamento";

export const SERVICE_PERSONA = {
  systemPrompt:
    "Você é o assistente de atendimento da Cruzeiro do Sul Virtual. Seu trabalho é entender rapidamente quem é a pessoa e o que ela precisa, e encaminhá-la ao setor certo do polo dela: tutoria, secretaria ou comercial. Você não resolve assuntos acadêmicos nem financeiros: você direciona.",
  tone: "Acolhedor, rápido e profissional, como uma boa conversa de WhatsApp. Blocos curtos, no máximo um emoji por mensagem.",
  rules: "Uma pergunta por mensagem. Descubra o nome, a cidade ou o polo e o assunto. Não peça CPF, senha ou dados de pagamento. Assim que souber o setor, encaminhe.",
  forbidden: "Nunca prometa prazo de resposta, resultado de solicitação, desconto ou valores. Nunca invente informações do curso ou da instituição.",
  handoffMessage: "Vou chamar uma pessoa da nossa equipe para continuar com você. Um momento, por favor.",
  unknownMessage: "Para não te passar nada errado, vou encaminhar para a equipe certa verificar para você."
};

// What each sector takes care of: the agent decides by this text (the team edits it in "Melhorar o agente")
export const SERVICE_KB: Array<{ title: string; content: string; topic: string; keywords?: string }> = [
  {
    title: "O que a tutoria atende",
    topic: "institutional/tutoring",
    keywords: "tutoria, tutor, plataforma, ambiente virtual, atividade, prova, prazo, disciplina, nota, acesso",
    content:
      "A tutoria acompanha o aluno durante o curso: primeiro acesso e uso da plataforma, disciplinas, organização da grade, atividades, provas, prazos, dúvidas de conteúdo e orientações acadêmicas do dia a dia. Encaminhe para a tutoria quem já é aluno e tem uma dúvida de estudo ou de acesso."
  },
  {
    title: "O que a secretaria atende",
    topic: "institutional/enrollment",
    keywords: "secretaria, documento, declaração, histórico, certificado, diploma, trancamento, cancelamento, rematrícula, segunda via",
    content:
      "A secretaria cuida da parte documental: declarações, histórico escolar, certificados, diploma, segunda via de documentos, rematrícula, trancamento e cancelamento, e a conferência de documentos da matrícula. Encaminhe para a secretaria quem precisa de um documento ou de uma solicitação formal."
  },
  {
    title: "Quando encaminhar para o comercial",
    topic: "institutional/enrollment",
    keywords: "matricular, matrícula, curso novo, quero estudar, bolsa, valor, proposta",
    content:
      "Quem ainda não é aluno e quer conhecer cursos, saber de valores, bolsa ou se matricular deve ser encaminhado para o comercial do polo. Valores e bolsas nunca são informados por este agente."
  }
];

const stage = (d: any) => ({ useKnowledge: true, maxTurns: 10, tools: [], http: [], outcomes: [], fields: [], instructions: "", opening: "", hooks: [], historyTurns: 6, ...d });

export const serviceGraph = (): Graph =>
  build({
    nodes: [
      ["start", "start", {}],
      ["triagem", "stage", stage({
        title: "Entender o assunto",
        objective: "Descobrir o nome da pessoa, a cidade ou o polo e o que ela precisa, e escolher o setor certo: tutoria, secretaria ou comercial.",
        instructions:
          "Cumprimente, pergunte o nome e o que a pessoa precisa. Se faltar, pergunte a cidade ou o polo (uma pergunta por mensagem). Use a base de conhecimento “O que a tutoria atende / O que a secretaria atende” para decidir. Dúvida de estudo, acesso, atividade ou prova: tutoria. Documento, declaração, histórico, trancamento ou rematrícula: secretaria. Quem quer conhecer cursos, valores ou se matricular: comercial. Na dúvida entre dois setores, pergunte o que a pessoa precisa resolver. Ao decidir, diga em uma frase para onde vai encaminhar.",
        fields: [
          { key: "nome", label: "Nome", type: "text", required: false },
          { key: "cidade", label: "Cidade ou polo", type: "text", required: false }
        ],
        maxTurns: 10,
        outcomes: [
          { id: "tutoria", label: "Tutoria", when: "quando o assunto for estudo, plataforma, acesso, atividades, provas, prazos ou dúvidas de conteúdo de quem já é aluno" },
          { id: "secretaria", label: "Secretaria", when: "quando a pessoa precisar de documento, declaração, histórico, certificado, diploma, rematrícula, trancamento ou cancelamento" },
          { id: "comercial", label: "Comercial", when: "quando a pessoa ainda não é aluna e quiser conhecer cursos, valores, bolsa ou se matricular" }
        ]
      })],
      ["tutoria", "transfer", { to: "polo_tutoria", title: "Encaminhar para a tutoria" }],
      ["secretaria", "transfer", { to: "polo_coordenacao", title: "Encaminhar para a secretaria" }],
      ["comercial", "transfer", { to: "polo_sales", title: "Encaminhar para o comercial" }],
      ["pessoa", "transfer", { to: "polo_coordenacao", title: "Encaminhar para uma pessoa" }]
    ],
    links: [
      ["start", "triagem"],
      ["triagem", "tutoria", "tutoria"], ["triagem", "secretaria", "secretaria"], ["triagem", "comercial", "comercial"],
      ["triagem", "tutoria", "done"], ["triagem", "pessoa", "human"], ["triagem", "pessoa", "off"], ["triagem", "pessoa", "limit"]
    ]
  });
