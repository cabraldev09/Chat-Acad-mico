import ChatbotNode from "../../models/ChatbotNode";
import { FlowEdge, FlowNode, Graph, exitsOf, handleOf } from "./Graph";

// Puts blocks on the canvas by depth: the start on the left, each next step one column to the right.
export const autoLayout = (graph: Graph): Graph => {
  const depth = new Map<string, number>();
  const start = graph.nodes.find(n => n.type === "start") || graph.nodes[0];
  if (start) {
    const queue: string[] = [start.id];
    depth.set(start.id, 0);
    while (queue.length) {
      const id = queue.shift() as string;
      graph.edges.filter(e => e.source === id).forEach(e => {
        if (!depth.has(e.target)) {
          depth.set(e.target, (depth.get(id) || 0) + 1);
          queue.push(e.target);
        }
      });
    }
  }
  const rows = new Map<number, number>();
  const nodes = graph.nodes.map(n => {
    const col = depth.get(n.id) ?? 0;
    const row = rows.get(col) || 0;
    rows.set(col, row + 1);
    return { ...n, x: 60 + col * 340, y: 60 + row * 230 };
  });
  return { ...graph, nodes };
};

let counter = 0;
const uid = (p: string) => `${p}${Date.now().toString(36)}${(counter += 1).toString(36)}`;

// Small builder used by the templates: blocks by key, links by key.
const build = (spec: { nodes: Array<[string, string, any]>; links: Array<[string, string, string?]> }): Graph => {
  const nodes: FlowNode[] = spec.nodes.map(([key, type, data]) => ({ id: key, type, data }));
  const edges: FlowEdge[] = spec.links.map(([source, target, handle], i) => ({ id: `e${i}`, source, target, sourceHandle: handle || null }));
  return autoLayout({ nodes, edges });
};

export interface FlowTemplate {
  key: string;
  name: string;
  description: string;
  entry: { type: string; keywords?: string[] };
  graph: Graph;
}

export const TEMPLATES: FlowTemplate[] = [
  {
    key: "boas-vindas",
    name: "Boas-vindas e qualificação",
    description: "Cumprimenta, pergunta o interesse com botões, coleta nome e curso e envia o contato ao CRM com um consultor.",
    entry: { type: "first_message" },
    graph: build({
      nodes: [
        ["start", "start", {}],
        ["menu", "buttons", {
          text: "Olá, {{primeiro_nome}}! 👋 Eu sou o assistente virtual da Cruzeiro do Sul Virtual. Como posso ajudar?",
          options: [
            { id: "o1", label: "Quero conhecer os cursos" },
            { id: "o2", label: "Já sou aluno" },
            { id: "o3", label: "Falar com um atendente" }
          ]
        }],
        ["nome", "ask", { text: "Que bom! Para começar, qual é o seu nome completo?", field: "nome", validate: "text" }],
        ["curso", "ask", { text: "Qual curso você tem interesse?", field: "curso", validate: "text" }],
        ["polo", "polo", { text: "Qual polo fica mais perto de você? Responda com o número, o nome ou a cidade." }],
        ["crm", "crm", { action: "send_to_crm", ownerMode: "roundrobin", source: "Chatbot" }],
        ["fim1", "message", { text: "Perfeito, {{primeiro_nome}}! Um consultor vai falar com você em instantes. 🎓" }],
        ["transfer", "transfer", { to: "chosen_polo_sales" }],
        ["aluno", "message", { text: "Para assuntos acadêmicos, a tutoria do seu polo vai te atender." }],
        ["aluno_t", "transfer", { to: "polo_tutoria" }],
        ["humano", "transfer", { to: "polo_sales", text: "Certo! Já estou chamando um atendente." }]
      ],
      links: [
        ["start", "menu"], ["menu", "nome", "o1"], ["menu", "aluno", "o2"], ["menu", "humano", "o3"],
        ["nome", "curso"], ["curso", "polo"], ["polo", "crm"], ["polo", "crm", "other"], ["crm", "fim1"], ["fim1", "transfer"],
        ["aluno", "aluno_t"]
      ]
    })
  },
  {
    key: "fora-do-horario",
    name: "Fora do horário de atendimento",
    description: "Se a mensagem chega fora do expediente, avisa, pede o nome e deixa o contato no CRM para o primeiro horário.",
    entry: { type: "first_message" },
    graph: build({
      nodes: [
        ["start", "start", {}],
        ["cond", "condition", { rules: [{ id: "r1", label: "Fora do expediente", all: [{ field: "hours", op: "eq", value: "closed" }] }] }],
        ["aviso", "message", { text: "Olá! Nosso atendimento funciona em horário comercial, mas já anotei a sua mensagem. 😊" }],
        ["nome", "ask", { text: "Qual é o seu nome?", field: "nome", validate: "text" }],
        ["crm", "crm", { action: "send_to_crm", ownerMode: "roundrobin", source: "Chatbot" }],
        ["fim", "end", { text: "Obrigado, {{primeiro_nome}}! Retornamos no próximo horário de atendimento." }],
        ["ia", "ai", {}]
      ],
      links: [["start", "cond"], ["cond", "aviso", "r1"], ["cond", "ia", "else"], ["aviso", "nome"], ["nome", "crm"], ["crm", "fim"]]
    })
  },
  {
    key: "escolha-de-polo",
    name: "Escolha de polo",
    description: "Pergunta qual polo a pessoa prefere (entende número, nome ou cidade), grava o polo no lead e leva para o comercial daquele polo.",
    entry: { type: "first_message" },
    graph: build({
      nodes: [
        ["start", "start", {}],
        ["oi", "message", { text: "Olá, {{primeiro_nome}}! 👋 Vou te ajudar a falar com o polo certo." }],
        ["polo", "polo", { text: "Qual polo fica mais perto de você? Responda com o número, o nome ou a cidade." }],
        ["nome", "ask", { text: "Qual é o seu nome completo?", field: "nome", validate: "text" }],
        ["crm", "crm", { action: "send_to_crm", ownerMode: "roundrobin", source: "Chatbot" }],
        ["fim", "message", { text: "Pronto! A equipe do polo {{polo}} já vai falar com você. 🎓" }],
        ["transfer", "transfer", { to: "chosen_polo_sales" }],
        ["ia", "ai", {}]
      ],
      links: [["start", "oi"], ["oi", "polo"], ["polo", "nome"], ["polo", "ia", "other"], ["nome", "crm"], ["crm", "fim"], ["fim", "transfer"]]
    })
  },
  {
    key: "triagem-de-qualificacao",
    name: "Triagem de qualificação",
    description: "Pergunta a modalidade, quando a pessoa pretende decidir e o motivo, guarda as respostas no lead (elas entram na pontuação) e leva quem está pronto direto para um consultor.",
    entry: { type: "first_message" },
    graph: build({
      nodes: [
        ["start", "start", {}],
        ["oi", "message", { text: "Olá, {{primeiro_nome}}! 👋 Vou te fazer 3 perguntas rápidas para o consultor já saber como te ajudar." }],
        ["modal", "buttons", {
          text: "Como você prefere estudar?",
          saveTo: "modalidade",
          options: [{ id: "m1", label: "EAD" }, { id: "m2", label: "Semipresencial" }, { id: "m3", label: "Presencial" }]
        }],
        ["prazo", "buttons", {
          text: "Quando você pretende começar?",
          saveTo: "prazo_decisao",
          options: [
            { id: "p1", label: "Quer matricular agora" },
            { id: "p2", label: "Decide esta semana" },
            { id: "p3", label: "Decide este mês" },
            { id: "p4", label: "Pesquisando, sem prazo" }
          ]
        }],
        ["motivo", "buttons", {
          text: "O que mais te motiva a estudar?",
          saveTo: "motivacao",
          options: [
            { id: "t1", label: "Primeira graduação" },
            { id: "t2", label: "Mudança de carreira" },
            { id: "t3", label: "Promoção ou crescimento" },
            { id: "t4", label: "Segunda graduação" }
          ]
        }],
        ["crm", "crm", { action: "send_to_crm", ownerMode: "roundrobin", source: "Chatbot" }],
        ["quente", "condition", { rules: [{ id: "r1", label: "Pronto para decidir", all: [{ field: "var:prazo_decisao", op: "in", value: "Quer matricular agora, Decide esta semana" }] }] }],
        ["fim1", "message", { text: "Perfeito, {{primeiro_nome}}! Como você está perto de decidir, um consultor vai falar com você agora. 🎓" }],
        ["transfer", "transfer", { to: "polo_sales" }],
        ["fim2", "end", { text: "Obrigado, {{primeiro_nome}}! Anotei tudo e um consultor entra em contato para te ajudar a escolher o melhor caminho. 😊" }]
      ],
      links: [
        ["start", "oi"], ["oi", "modal"], ["modal", "prazo", "m1"], ["modal", "prazo", "m2"], ["modal", "prazo", "m3"],
        ["prazo", "motivo", "p1"], ["prazo", "motivo", "p2"], ["prazo", "motivo", "p3"], ["prazo", "motivo", "p4"],
        ["motivo", "crm", "t1"], ["motivo", "crm", "t2"], ["motivo", "crm", "t3"], ["motivo", "crm", "t4"],
        ["crm", "quente"], ["quente", "fim1", "r1"], ["quente", "fim2", "else"], ["fim1", "transfer"]
      ]
    })
  },
  {
    key: "follow-up-lead-parado",
    name: "Follow-up de lead parado",
    description: "Para o gatilho “Lead parado”: retoma a conversa de quem parou de responder, com botões para continuar, adiar ou falar com um consultor.",
    entry: { type: "manual" },
    graph: build({
      nodes: [
        ["start", "start", {}],
        ["oi", "buttons", {
          text: "Oi, {{primeiro_nome}}! Passando para saber se você ainda tem interesse em estudar na Cruzeiro do Sul Virtual. Posso te ajudar com alguma dúvida? 😊",
          options: [
            { id: "o1", label: "Ainda tenho interesse" },
            { id: "o2", label: "Agora não" },
            { id: "o3", label: "Falar com um consultor" }
          ]
        }],
        ["sim", "message", { text: "Que bom! Um consultor vai continuar a conversa com você." }],
        ["sim_t", "transfer", { to: "polo_sales" }],
        ["depois", "end", { text: "Tudo bem! Quando quiser retomar é só me chamar por aqui. 🎓" }],
        ["humano", "transfer", { to: "polo_sales", text: "Certo! Já estou chamando um consultor." }]
      ],
      links: [["start", "oi"], ["oi", "sim", "o1"], ["oi", "depois", "o2"], ["oi", "humano", "o3"], ["sim", "sim_t"]]
    })
  },
  {
    key: "lembrete-prazo-matricula",
    name: "Lembrete de prazo de matrícula",
    description: "Para o gatilho “Prazo de matrícula se aproximando”: avisa que o período está acabando e chama um consultor para quem quer garantir a vaga.",
    entry: { type: "manual" },
    graph: build({
      nodes: [
        ["start", "start", {}],
        ["aviso", "buttons", {
          text: "Oi, {{primeiro_nome}}! O prazo de matrícula do período está chegando ao fim. Quer garantir a sua vaga? Posso chamar um consultor agora.",
          options: [
            { id: "o1", label: "Quero me matricular" },
            { id: "o2", label: "Preciso de mais tempo" }
          ]
        }],
        ["humano", "transfer", { to: "polo_sales", text: "Perfeito! Já estou chamando um consultor para finalizar com você." }],
        ["depois", "end", { text: "Sem problema! Me avise por aqui quando estiver pronto(a). 😊" }]
      ],
      links: [["start", "aviso"], ["aviso", "humano", "o1"], ["aviso", "depois", "o2"]]
    })
  },
  {
    key: "bolsa",
    name: "Interesse em bolsa",
    description: "Para quem escreve “bolsa”: pergunta o curso e a modalidade com botões e envia ao CRM.",
    entry: { type: "keyword", keywords: ["bolsa", "desconto"] },
    graph: build({
      nodes: [
        ["start", "start", {}],
        ["curso", "ask", { text: "Que bom que você quer saber de bolsas! Qual curso te interessa?", field: "curso", validate: "text" }],
        ["modal", "buttons", {
          text: "Prefere estudar como?",
          saveTo: "modalidade",
          options: [{ id: "m1", label: "100% EAD" }, { id: "m2", label: "Semipresencial" }, { id: "m3", label: "Presencial" }]
        }],
        ["crm", "crm", { action: "send_to_crm", ownerMode: "roundrobin", source: "Chatbot" }],
        ["fim", "end", { text: "Anotado! Um consultor vai calcular a bolsa com você. Os valores dependem da proposta e não são fixos até o fim do curso." }]
      ],
      links: [["start", "curso"], ["curso", "modal"], ["modal", "crm", "m1"], ["modal", "crm", "m2"], ["modal", "crm", "m3"], ["crm", "fim"]]
    })
  }
];

export const blankGraph = (): Graph => ({ nodes: [{ id: uid("n"), type: "start", x: 60, y: 60, data: {} }], edges: [] });

// The old menu of the chatbot (a tree of options) as a flow, so it can be seen and edited on the canvas.
export const legacyToGraph = async (whatsappId: number | null): Promise<Graph | null> => {
  const all = await ChatbotNode.findAll({ order: [["position", "ASC"], ["id", "ASC"]] });
  const nodes = all.filter(n => (whatsappId ? n.whatsappId === whatsappId || n.whatsappId === null : true));
  if (!nodes.length) return null;
  const out: FlowNode[] = [{ id: "start", type: "start", data: {} }];
  const edges: FlowEdge[] = [];
  let e = 0;
  const link = (source: string, target: string, handle?: string) => { e += 1; edges.push({ id: `e${e}`, source, target, sourceHandle: handle || null }); };
  const idOf = (n: ChatbotNode) => `n${n.id}`;
  const childrenOf = (parent: number | null) => nodes.filter(n => (n.parentId || null) === parent);

  // the action of an option becomes the blocks that run after it is chosen
  const actionBlocks = (n: ChatbotNode): { first: string } => {
    const id = idOf(n);
    const text = n.message || "";
    switch (n.action) {
      case "menu": {
        const kids = childrenOf(n.id);
        out.push({ id, type: "buttons", data: { text: text || n.title, options: kids.map(k => ({ id: `o${k.id}`, label: k.title, keywords: k.keywords || "" })) } });
        kids.forEach(k => link(id, actionBlocks(k).first, `o${k.id}`));
        return { first: id };
      }
      case "queue":
        out.push({ id, type: "transfer", data: { to: "queue", queueId: n.targetId, text } });
        return { first: id };
      case "user":
        out.push({ id, type: "transfer", data: { to: "user", userId: n.targetId, text } });
        return { first: id };
      case "ai":
        out.push({ id, type: "ai", data: { text } });
        return { first: id };
      case "close":
        out.push({ id, type: "end", data: { text, close: true } });
        return { first: id };
      case "ask":
        out.push({ id, type: "ask", data: { text: text || n.title, field: n.field || "nome", validate: n.field === "email" ? "email" : "text" } });
        childrenOf(n.id).slice(0, 1).forEach(k => link(id, actionBlocks(k).first));
        return { first: id };
      case "stage":
      case "tag": {
        out.push({ id, type: "crm", data: n.action === "stage" ? { action: "move_stage", stageId: n.targetId } : { action: "add_tag", tagId: n.targetId } });
        const next = childrenOf(n.id)[0];
        if (next) link(id, actionBlocks(next).first);
        else {
          out.push({ id: `${id}e`, type: "end", data: text ? { text } : {} });
          link(id, `${id}e`);
        }
        return { first: id };
      }
      case "webhook": {
        out.push({ id, type: "webhook", data: { url: n.field || "" } });
        const next = childrenOf(n.id)[0];
        if (next) link(id, actionBlocks(next).first);
        else {
          out.push({ id: `${id}e`, type: "end", data: text ? { text } : {} });
          link(id, `${id}e`);
        }
        return { first: id };
      }
      default:
        // "message": answers with text and ends
        out.push({ id, type: "message", data: { text: text || n.title } });
        out.push({ id: `${id}e`, type: "end", data: {} });
        link(id, `${id}e`);
        return { first: id };
    }
  };
  const roots = childrenOf(null);
  const menuId = "root";
  out.push({ id: menuId, type: "buttons", data: { text: "Olá, {{primeiro_nome}}! Como posso ajudar? Escolha uma opção:", options: roots.map(k => ({ id: `o${k.id}`, label: k.title, keywords: k.keywords || "" })) } });
  link("start", menuId);
  roots.forEach(k => link(menuId, actionBlocks(k).first, `o${k.id}`));
  return autoLayout({ nodes: out, edges });
};

export { exitsOf, handleOf };
