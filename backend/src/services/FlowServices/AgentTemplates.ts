import AiAgent from "../../models/AiAgent";
import LeadStage from "../../models/LeadStage";
import { slotsOf } from "../AiServices/Tools";
import { Graph } from "./Graph";
import { build } from "./Templates";
import { slug } from "./StageSpec";
import { COMMERCIAL_KB, COMMERCIAL_PERSONA, COMMERCIAL_TEMPLATE_KEY, commercialGraph } from "../CommercialServices/Template";

// Ready agents by segment: the persona, a few answers for the knowledge base and the blocks (stages, exits, CRM actions).
// "Criar com IA" starts from a description; these start from a good example that the team edits.
export interface AgentTemplate {
  key: string;
  name: string;
  description: string;
  segment: string;
  persona: { systemPrompt: string; tone: string; rules: string; forbidden: string; handoffMessage: string; unknownMessage: string };
  faq: Array<{ title: string; content: string; keywords?: string }>;
  // approved passages of the knowledge base by subject (topic), read only when the question is about that subject
  kb?: Array<{ title: string; content: string; topic: string; keywords?: string }>;
  // the agent keeps the CRM by itself: its columns of the funnel are mapped (and created when missing) when it is made
  commercial?: boolean;
  graph: Graph;
}

const HANDOFF = "Vou chamar um de nossos atendentes para continuar com você. Um momento, por favor.";
const UNKNOWN = "Ótima pergunta! Vou confirmar essa informação com a nossa equipe e já te respondo. 🙂";

const stage = (d: any) => ({ title: "Conversa", useKnowledge: true, maxTurns: 14, tools: [], http: [], outcomes: [], fields: [], instructions: "", opening: "", ...d });

export const AGENT_TEMPLATES: AgentTemplate[] = [
  {
    key: COMMERCIAL_TEMPLATE_KEY,
    name: "Comercial",
    description: "Faz toda a qualificação do lead, tira as dúvidas do curso (duração, grade, estágio, plataforma, tutoria) e, na hora da proposta, passa para um consultor do polo gerar a proposta comercial. Também atende quem já é aluno: entende o assunto e chama a tutoria ou a secretaria do polo.",
    segment: "Comercial",
    persona: COMMERCIAL_PERSONA,
    faq: [],
    kb: COMMERCIAL_KB,
    commercial: true,
    graph: commercialGraph()
  }
];

export const templateSummary = (t: AgentTemplate) => ({ key: t.key, name: t.name, description: t.description, segment: t.segment, commercial: !!t.commercial, stages: t.graph.nodes.filter(n => n.type === "stage").length, blocks: t.graph.nodes.length });

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
