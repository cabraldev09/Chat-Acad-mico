import AiAgent from "../../models/AiAgent";
import LeadStage from "../../models/LeadStage";
import { slotsOf } from "../AiServices/Tools";
import { Graph } from "./Graph";
import { build } from "./Templates";
import { slug } from "./StageSpec";

// Ready agents by segment: the persona, a few answers for the knowledge base and the blocks (stages, exits, CRM actions).
// "Criar com IA" starts from a description; these start from a good example that the team edits.
export interface AgentTemplate {
  key: string;
  name: string;
  description: string;
  segment: string;
  persona: { systemPrompt: string; tone: string; rules: string; forbidden: string; handoffMessage: string; unknownMessage: string };
  faq: Array<{ title: string; content: string; keywords?: string }>;
  graph: Graph;
}

const HANDOFF = "Vou chamar um de nossos atendentes para continuar com você. Um momento, por favor.";
const UNKNOWN = "Ótima pergunta! Vou confirmar essa informação com a nossa equipe e já te respondo. 🙂";

const stage = (d: any) => ({ title: "Conversa", useKnowledge: true, maxTurns: 14, tools: [], http: [], outcomes: [], fields: [], instructions: "", opening: "", ...d });

export const AGENT_TEMPLATES: AgentTemplate[] = [
  {
    key: "captacao-matricula",
    name: "Captação e matrícula",
    description: "Recebe o interessado, descobre nome, cidade e curso, tira dúvidas, simula bolsa e passa para um consultor do polo.",
    segment: "Educação",
    persona: {
      systemPrompt: "Você é o assistente de matrículas de uma instituição de ensino superior. Atenda de forma humana, curta e objetiva, ajudando a pessoa a escolher o curso e a dar o próximo passo.",
      tone: "Simpático, direto e profissional. Usa o primeiro nome da pessoa e no máximo um emoji por mensagem.",
      rules: "Pergunte uma coisa por vez. Use as ferramentas para cursos, polos e bolsa. Valores e bolsa sempre dependem da proposta oficial de um consultor.",
      forbidden: "Não prometa mensalidade fixa até o fim do curso, não fale em regressão de bolsa e não invente datas ou valores.",
      handoffMessage: HANDOFF,
      unknownMessage: UNKNOWN
    },
    faq: [
      { title: "Como funciona o ensino a distância (EAD)?", content: "No EAD você estuda pela plataforma online, no seu ritmo, com provas e atividades. Você conta com o apoio da tutoria depois da matrícula.", keywords: "ead, distância, online" },
      { title: "O que é semipresencial?", content: "No semipresencial parte das aulas é online e parte acontece no polo, em encontros presenciais.", keywords: "semipresencial, polo, presencial" }
    ],
    graph: build({
      nodes: [
        ["start", "start", {}],
        ["conversa", "stage", stage({
          title: "Descobrir o interesse",
          objective: "Descobrir nome, cidade e curso de interesse da pessoa e deixá-la pronta para falar com um consultor.",
          instructions: "Cumprimente, pergunte o que a pessoa quer estudar e, aos poucos, a cidade. Se perguntarem de valores, explique que é estimativa e que o consultor faz a proposta oficial.",
          fields: [
            { key: "nome", label: "Nome", type: "text", required: true },
            { key: "cidade", label: "Cidade", type: "text", required: true },
            { key: "curso", label: "Curso de interesse", type: "text", required: true },
            { key: "modalidade", label: "Modalidade", type: "choice", required: false, options: ["EAD", "Semipresencial"] }
          ],
          tools: ["buscar_curso", "listar_polos", "simular_bolsa"],
          outcomes: [{ id: "ja_aluno", label: "Já é aluno", when: "quando a pessoa disser que já é aluna da instituição" }]
        })],
        ["crm", "crm", { action: "send_to_crm", source: "Agente de IA" }],
        ["tarefa", "crm", { action: "create_task", title: "Ligar para o interessado qualificado pelo agente de IA", minutes: 60 }],
        ["consultor", "transfer", { to: "polo_sales", text: "Perfeito! Um consultor do seu polo vai continuar com você daqui. 😊" }],
        ["aluno", "transfer", { to: "polo_tutoria", text: "Certo! Vou chamar a tutoria para ajudar você." }]
      ],
      links: [["start", "conversa"], ["conversa", "crm", "done"], ["crm", "tarefa"], ["tarefa", "consultor"], ["conversa", "aluno", "ja_aluno"]]
    })
  },
  {
    key: "atendimento-faq",
    name: "Atendimento e dúvidas",
    description: "Responde dúvidas com a base de conhecimento, não inventa nada e chama uma pessoa quando não sabe.",
    segment: "Atendimento",
    persona: {
      systemPrompt: "Você é o assistente de atendimento da empresa. Responda dúvidas com clareza e gentileza usando apenas a base de conhecimento.",
      tone: "Cordial, claro e objetivo.",
      rules: "Responda em poucas frases. Se a pergunta não estiver na base, não invente: peça ajuda da equipe.",
      forbidden: "Não invente prazos, preços, políticas ou promessas.",
      handoffMessage: HANDOFF,
      unknownMessage: UNKNOWN
    },
    faq: [{ title: "Qual o horário de atendimento?", content: "Nosso atendimento funciona de segunda a sexta, em horário comercial. Fora disso, deixe sua mensagem que respondemos assim que possível.", keywords: "horário, atendimento, funciona" }],
    graph: build({
      nodes: [
        ["start", "start", {}],
        ["duvidas", "stage", stage({
          title: "Tirar dúvidas",
          objective: "Resolver a dúvida da pessoa usando a base de conhecimento. Encerrar quando ela estiver satisfeita.",
          instructions: "Pergunte se pode ajudar em mais alguma coisa quando responder uma dúvida.",
          maxTurns: 20,
          outcomes: [{ id: "reclamacao", label: "Reclamação", when: "quando a pessoa estiver insatisfeita, reclamando ou pedindo cancelamento" }]
        })],
        ["adeus", "end", { text: "Foi um prazer ajudar! Qualquer coisa, é só chamar. 🙂", close: true }],
        ["reclama", "crm", { action: "create_task", title: "Cliente insatisfeito pediu atenção no atendimento com IA", minutes: 30 }],
        ["humano", "transfer", { to: "polo_sales", text: "Sinto muito por isso. Vou passar para um atendente resolver com prioridade." }]
      ],
      links: [["start", "duvidas"], ["duvidas", "adeus", "done"], ["duvidas", "reclama", "reclamacao"], ["reclama", "humano"]]
    })
  },
  {
    key: "qualificacao-leads",
    name: "Qualificação de leads",
    description: "Descobre contato, interesse e urgência; quem está pronto vai direto para um consultor, os demais seguem em nutrição.",
    segment: "Vendas",
    persona: {
      systemPrompt: "Você é o assistente de pré-atendimento comercial. Seu papel é conhecer a pessoa e entender o momento de decisão dela, sem pressionar.",
      tone: "Leve, curioso e respeitoso.",
      rules: "Faça perguntas abertas, uma por vez. Registre o que descobrir.",
      forbidden: "Não pressione, não prometa descontos e não invente informações.",
      handoffMessage: HANDOFF,
      unknownMessage: UNKNOWN
    },
    faq: [],
    graph: build({
      nodes: [
        ["start", "start", {}],
        ["quali", "stage", stage({
          title: "Qualificar",
          objective: "Descobrir nome, e-mail, interesse e em quanto tempo a pessoa quer decidir.",
          fields: [
            { key: "nome", label: "Nome", type: "text", required: true },
            { key: "email", label: "E-mail", type: "email", required: true },
            { key: "motivacao", label: "Interesse", type: "text", required: false },
            { key: "prazo", label: "Quando pretende decidir", type: "choice", required: true, options: ["Imediato", "1 a 3 meses", "Mais de 3 meses", "Só pesquisando"] }
          ]
        })],
        ["urgente", "condition", { rules: [{ id: "quente", label: "Quer decidir já", all: [{ field: "var:prazo", op: "eq", value: "Imediato" }] }] }],
        ["tarefa", "crm", { action: "create_task", title: "Lead quente: ligar agora", minutes: 30 }],
        ["consultor", "transfer", { to: "polo_sales", text: "Ótimo! Vou chamar um consultor para falar com você agora." }],
        ["nutrir", "crm", { action: "send_to_crm", source: "Agente de IA" }],
        ["ate", "end", { text: "Obrigado! Vamos manter contato e te avisar das novidades. 😊" }]
      ],
      links: [["start", "quali"], ["quali", "urgente", "done"], ["urgente", "tarefa", "quente"], ["tarefa", "consultor"], ["urgente", "nutrir", "else"], ["nutrir", "ate"]]
    })
  },
  {
    key: "agendamento",
    name: "Agendamento",
    description: "Coleta dados, consulta horários em um sistema externo e registra o agendamento para a equipe confirmar.",
    segment: "Serviços",
    persona: {
      systemPrompt: "Você é o assistente de agendamentos. Ajude a pessoa a escolher dia e horário com clareza.",
      tone: "Gentil e objetivo.",
      rules: "Confirme sempre o dia e o horário antes de concluir. Use a ferramenta de horários para sugerir opções reais.",
      forbidden: "Não confirme um horário que a ferramenta não mostrou como livre.",
      handoffMessage: HANDOFF,
      unknownMessage: UNKNOWN
    },
    faq: [],
    graph: build({
      nodes: [
        ["start", "start", {}],
        ["agenda", "stage", stage({
          title: "Agendar",
          objective: "Descobrir nome, dia e horário desejados, consultar os horários livres e deixar o agendamento combinado.",
          instructions: "Troque o endereço da ferramenta “horarios” pelo da sua agenda no bloco.",
          fields: [
            { key: "nome", label: "Nome", type: "text", required: true },
            { key: "dia", label: "Dia desejado", type: "date", required: true },
            { key: "horario", label: "Horário desejado", type: "text", required: true }
          ],
          http: [{ name: "horarios", description: "Consulta os horários livres de um dia. Use antes de sugerir horários.", url: "https://exemplo.com/api/horarios", method: "GET", params: [{ name: "dia", description: "Dia no formato AAAA-MM-DD", type: "string", required: true }] }]
        })],
        ["tarefa", "crm", { action: "create_task", title: "Confirmar o agendamento combinado pelo agente de IA", minutes: 60 }],
        ["ok", "end", { text: "Combinado! Nossa equipe vai confirmar o agendamento com você. 😊" }]
      ],
      links: [["start", "agenda"], ["agenda", "tarefa", "done"], ["tarefa", "ok"]]
    })
  },
  {
    key: "pos-venda",
    name: "Pós-venda e retenção",
    description: "Acompanha quem já é cliente: tira dúvidas, percebe insatisfação e aciona a equipe antes da evasão.",
    segment: "Relacionamento",
    persona: {
      systemPrompt: "Você é o assistente de relacionamento com quem já é cliente. Cuide da experiência da pessoa e perceba sinais de insatisfação.",
      tone: "Acolhedor, atento e empático.",
      rules: "Escute primeiro. Pergunte como a pessoa está se sentindo com o serviço. Se houver problema, acolha e chame a equipe.",
      forbidden: "Não discuta, não minimize reclamações e não prometa soluções que não conhece.",
      handoffMessage: HANDOFF,
      unknownMessage: UNKNOWN
    },
    faq: [],
    graph: build({
      nodes: [
        ["start", "start", {}],
        ["cuidado", "stage", stage({
          title: "Cuidar do cliente",
          objective: "Entender como o cliente está e resolver dúvidas. Se estiver insatisfeito, acolher e acionar a equipe.",
          maxTurns: 16,
          outcomes: [{ id: "insatisfeito", label: "Insatisfeito", when: "quando a pessoa demonstrar insatisfação, vontade de cancelar ou abandonar" }]
        })],
        ["tarefa", "crm", { action: "create_task", title: "Cliente com risco de evasão: ligar hoje", minutes: 60 }],
        ["time", "transfer", { to: "polo_tutoria", text: "Obrigado por contar com a gente. Vou pedir para a nossa equipe falar com você ainda hoje." }],
        ["ok", "end", { text: "Que bom ter você com a gente! Se precisar, é só chamar. 💙" }]
      ],
      links: [["start", "cuidado"], ["cuidado", "ok", "done"], ["cuidado", "tarefa", "insatisfeito"], ["tarefa", "time"]]
    })
  }
];

export const templateSummary = (t: AgentTemplate) => ({ key: t.key, name: t.name, description: t.description, segment: t.segment, stages: t.graph.nodes.filter(n => n.type === "stage").length, blocks: t.graph.nodes.length });

// The agent of today (one prompt, its fields and its functions) as blocks: the same behaviour in a draft the team can review.
export const convertAgent = async (agent: AiAgent): Promise<Graph> => {
  const functions: Array<{ name: string; description: string; flowId: number }> = Array.isArray(agent.functions) ? (agent.functions as any) : [];
  const slots = slotsOf(agent);
  const qualified = await LeadStage.findOne({ where: { name: "Qualificado" } });
  const nodes: Array<[string, string, any]> = [
    ["start", "start", {}],
    ["conversa", "stage", stage({
      title: "Atendimento",
      objective: "Atender a pessoa seguindo as instruções do agente e descobrir os dados necessários para o consultor continuar.",
      maxTurns: agent.handoffAfterTurns || 14,
      fields: slots.map(s => ({ key: s.key, label: s.label, type: "text", required: s.required })),
      tools: ["buscar_curso", "listar_polos", "simular_bolsa"],
      outcomes: functions.map(f => ({ id: f.name, label: f.name, when: f.description }))
    })]
  ];
  const links: Array<[string, string, string?]> = [["start", "conversa"]];
  // everything needed is known: the lead goes to "Qualificado", a task is made for the owner and the conversation to the sales queue of the polo
  let last = "conversa";
  let handle: string | undefined = "done";
  if (qualified) {
    nodes.push(["qualificar", "crm", { action: "move_stage", stageId: qualified.id }]);
    links.push([last, "qualificar", handle]);
    last = "qualificar";
    handle = undefined;
  }
  nodes.push(["tarefa", "crm", { action: "create_task", title: "Ligar para o aluno que o agente de IA qualificou", minutes: 60 }]);
  links.push([last, "tarefa", handle]);
  nodes.push(["consultor", "transfer", { to: "polo_sales" }]);
  links.push(["tarefa", "consultor"]);
  functions.forEach((f, i) => {
    nodes.push([`fluxo${i}`, "flow", { flowId: f.flowId }]);
    links.push(["conversa", `fluxo${i}`, slug(f.name, 30)]);
  });
  return build({ nodes, links });
};
