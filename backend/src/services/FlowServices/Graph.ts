// The shape of a flow and the rules a flow must obey before it can talk to people.
import { FIXED_EXITS, cleanStage } from "./StageSpec";

export interface FlowNode {
  id: string;
  type: string;
  x?: number;
  y?: number;
  data: any;
}
export interface FlowEdge {
  id: string;
  source: string;
  sourceHandle?: string | null;
  target: string;
}
export interface Graph {
  nodes: FlowNode[];
  edges: FlowEdge[];
}
export interface Issue {
  level: "error" | "warning";
  nodeId?: string;
  text: string;
}

// blocks that stop and wait for the person (or for time)
export const WAITING = ["buttons", "ask", "delay", "polo", "stage"];
// blocks that end the conversation inside the flow
export const TERMINAL = ["end", "ai", "transfer", "flow"];
export const NODE_TYPES = ["start", "message", "buttons", "ask", "polo", "condition", "crm", "delay", "ai", "stage", "flow", "commercial", "transfer", "webhook", "random", "goto", "end", "comment"];
// what the block "Estado comercial" can do (see CommercialServices)
export const COMMERCIAL_OPS = ["ensure_lead", "sync_stage", "task", "note", "handoff_brief", "start_analysis"] as const;

export const TITLE: Record<string, string> = {
  start: "Início",
  message: "Mensagem",
  buttons: "Pergunta com botões",
  ask: "Pergunta aberta",
  polo: "Escolher polo",
  condition: "Condição",
  crm: "Ação no CRM",
  delay: "Espera",
  ai: "Agente de IA",
  stage: "Etapa com IA",
  flow: "Chamar fluxo",
  commercial: "Estado comercial",
  transfer: "Transferir",
  webhook: "Webhook",
  random: "Teste A/B",
  goto: "Ir para",
  end: "Fim",
  comment: "Comentário"
};

export const parseGraph = (raw: any): Graph => {
  try {
    const g = typeof raw === "string" ? JSON.parse(raw) : raw;
    return {
      nodes: Array.isArray(g?.nodes) ? g.nodes.filter((n: any) => n && n.id && NODE_TYPES.includes(n.type)).map((n: any) => ({ ...n, id: String(n.id), data: n.data || {} })) : [],
      edges: Array.isArray(g?.edges) ? g.edges.filter((e: any) => e && e.source && e.target).map((e: any) => ({ ...e, source: String(e.source), target: String(e.target) })) : []
    };
  } catch (e) {
    return { nodes: [], edges: [] };
  }
};

export const handleOf = (e: FlowEdge): string => e.sourceHandle || "out";

export const nextNodeId = (graph: Graph, nodeId: string, handle = "out"): string | null => {
  const edge = graph.edges.find(e => e.source === nodeId && handleOf(e) === handle);
  return edge ? edge.target : null;
};

// the exits a block must have connected
export const exitsOf = (node: FlowNode): Array<{ handle: string; required: boolean; label: string }> => {
  const d = node.data || {};
  switch (node.type) {
    case "start":
    case "message":
    case "ask":
    case "crm":
    case "commercial":
    case "delay":
      return [{ handle: "out", required: true, label: "saída" }];
    case "webhook":
      return [
        { handle: "out", required: true, label: "saída" },
        { handle: "error", required: false, label: "saída se falhar" }
      ];
    case "polo":
      return [
        { handle: "out", required: true, label: "saída (polo escolhido)" },
        { handle: "other", required: false, label: "resposta que não é um polo" }
      ];
    case "buttons":
      return [
        ...(d.options || []).map((o: any) => ({ handle: String(o.id), required: true, label: `opção “${o.label || "?"}”` })),
        { handle: "other", required: false, label: "resposta inesperada" }
      ];
    case "condition":
      return [
        ...(d.rules || []).map((r: any) => ({ handle: String(r.id), required: true, label: `condição “${r.label || "?"}”` })),
        { handle: "else", required: false, label: "saída “senão”" }
      ];
    case "stage": {
      const clean = cleanStage(d);
      return [
        { handle: "done", required: true, label: "saída “objetivo cumprido”" },
        { handle: "human", required: false, label: "saída “pediu uma pessoa”" },
        { handle: "off", required: false, label: "saída “fora do escopo”" },
        { handle: "limit", required: false, label: "saída “limite de turnos”" },
        ...clean.outcomes.map(o => ({ handle: o.id, required: true, label: `saída “${o.label || o.id}”` }))
      ];
    }
    case "random":
      return (d.branches || []).map((b: any) => ({ handle: String(b.id), required: true, label: `ramo “${b.label || "?"}”` }));
    default:
      return [];
  }
};

export const validateGraph = (graph: Graph, ctx: { hasAiAgent?: boolean; kind?: string } = {}): Issue[] => {
  const issues: Issue[] = [];
  const err = (text: string, nodeId?: string) => issues.push({ level: "error", text, nodeId });
  const warn = (text: string, nodeId?: string) => issues.push({ level: "warning", text, nodeId });
  const byId = new Map(graph.nodes.map(n => [n.id, n]));
  const starts = graph.nodes.filter(n => n.type === "start");
  if (starts.length === 0) err("Falta o bloco de início.");
  if (starts.length > 1) err("Há mais de um bloco de início. Deixe só um.");

  graph.edges.forEach(e => {
    if (!byId.has(e.source) || !byId.has(e.target)) err("Há uma ligação que aponta para um bloco que não existe.");
  });

  graph.nodes.forEach(n => {
    const d = n.data || {};
    const title = TITLE[n.type] || n.type;
    if (["message", "buttons", "ask", "polo"].includes(n.type) && !String(d.text || "").trim()) err(`${title}: escreva o texto da mensagem.`, n.id);
    if (n.type === "buttons") {
      const options = d.options || [];
      if (options.length < 2) err(`${title}: precisa de pelo menos 2 opções.`, n.id);
      if (options.length > 10) err(`${title}: no máximo 10 opções.`, n.id);
      if (options.some((o: any) => !String(o.label || "").trim())) err(`${title}: toda opção precisa de um nome.`, n.id);
    }
    if (n.type === "ask" && !String(d.field || "").trim()) err(`${title}: escolha onde guardar a resposta.`, n.id);
    if (n.type === "condition") {
      if (!(d.rules || []).length) err(`${title}: crie pelo menos uma condição.`, n.id);
      (d.rules || []).forEach((r: any) => {
        if (!(r.all || []).length) err(`${title}: a condição “${r.label || "?"}” está vazia.`, n.id);
      });
    }
    if (n.type === "crm") {
      if (!d.action) err(`${title}: escolha o que fazer no CRM.`, n.id);
      if (d.action === "move_stage" && !d.stageId) err(`${title}: escolha a etapa do funil.`, n.id);
      if ((d.action === "add_tag" || d.action === "remove_tag") && !d.tagId) err(`${title}: escolha a etiqueta.`, n.id);
      if (d.action === "create_task" && !String(d.title || "").trim()) err(`${title}: escreva o título da tarefa.`, n.id);
      if (d.action === "add_note" && !String(d.text || "").trim()) err(`${title}: escreva a nota.`, n.id);
    }
    if (n.type === "transfer") {
      if (!d.to) err(`${title}: escolha para onde levar a conversa.`, n.id);
      if (d.to === "queue" && !d.queueId) err(`${title}: escolha a fila.`, n.id);
      if (d.to === "user" && !d.userId) err(`${title}: escolha o atendente.`, n.id);
    }
    if (n.type === "webhook" && !/^https?:\/\//i.test(String(d.url || ""))) err(`${title}: informe o endereço (http ou https).`, n.id);
    if (n.type === "delay" && !(Number(d.minutes) > 0)) err(`${title}: informe quantos minutos esperar.`, n.id);
    if (n.type === "goto" && !byId.has(String(d.target || ""))) err(`${title}: escolha para qual bloco voltar.`, n.id);
    if (n.type === "random" && (d.branches || []).length < 2) err(`${title}: precisa de pelo menos 2 ramos.`, n.id);
    if (n.type === "stage") {
      const raw = d || {};
      const st = cleanStage(raw);
      if (!st.objective) err(`${title}: escreva o objetivo da etapa (o que a IA precisa conseguir).`, n.id);
      const keys = (raw.fields || []).map((f: any) => String(f?.key || f?.label || ""));
      if ((raw.fields || []).length !== st.fields.length) err(`${title}: cada campo precisa de um nome diferente.`, n.id);
      st.fields.forEach(f => {
        if (f.type === "choice" && !(f.options || []).length) err(`${title}: o campo “${f.label}” é de escolha e precisa de opções.`, n.id);
      });
      void keys;
      if ((raw.outcomes || []).length !== st.outcomes.length) err(`${title}: cada saída por intenção precisa de um nome diferente (e não pode ser “done”, “human”, “off” ou “limit”).`, n.id);
      st.outcomes.forEach(o => {
        if (!o.label || !o.when) err(`${title}: a saída “${o.label || o.id}” precisa de um nome e de uma descrição de quando usar.`, n.id);
      });
      if ((raw.http || []).length !== st.http.length) err(`${title}: cada ferramenta externa precisa de um nome diferente.`, n.id);
      st.http.forEach(t => {
        if (!/^https?:\/\//i.test(t.url)) err(`${title}: a ferramenta “${t.name}” precisa de um endereço http ou https.`, n.id);
        if (!t.description) err(`${title}: explique à IA quando usar a ferramenta “${t.name}”.`, n.id);
      });
      if (!ctx.hasAiAgent) warn(`${title}: nenhum agente de IA ativo foi encontrado; a conversa vai para a equipe.`, n.id);
    }
    if (n.type === "commercial") {
      if (!(COMMERCIAL_OPS as readonly string[]).includes(d.op)) err(`${title}: escolha o que fazer.`, n.id);
      if (d.op === "sync_stage" && !String(d.stageKey || "").trim()) err(`${title}: escolha a coluna do funil.`, n.id);
      if (d.op === "sync_stage" && String(d.stageKey) === "enrolled") err(`${title}: a coluna Matriculado só muda com a matrícula confirmada pelo sistema; o agente não pode movê-la.`, n.id);
      if (d.op === "task" && !String(d.title || "").trim()) err(`${title}: escreva o título da tarefa.`, n.id);
    }
    if (n.type === "flow" && !Number(d.flowId)) err(`${title}: escolha o fluxo que deve começar.`, n.id);
    if (n.type === "ai" && !ctx.hasAiAgent) warn("Agente de IA: nenhum agente ativo foi encontrado; a conversa vai para a equipe.", n.id);
    exitsOf(n).forEach(x => {
      if (!graph.edges.some(e => e.source === n.id && handleOf(e) === x.handle)) {
        if (x.required) err(`${title}: ligue a ${x.label} a um próximo passo.`, n.id);
        else if (x.handle === "other" || x.handle === "else") warn(`${title}: a ${x.label} não está ligada; a conversa termina ali.`, n.id);
        else if (n.type === "stage" && (FIXED_EXITS as readonly string[]).includes(x.handle) && !cleanStage(d).hooks.includes("commercial")) warn(`${title}: a ${x.label} não está ligada; a conversa vai para a equipe.`, n.id);
      }
    });
  });

  // reachable from the start
  if (ctx.kind === "agent" && !graph.nodes.some(n => n.type === "stage")) err("O agente precisa de pelo menos uma Etapa com IA.");
  if (starts.length === 1) {
    const seen = new Set<string>();
    const walk = (id: string) => {
      if (seen.has(id)) return;
      seen.add(id);
      graph.edges.filter(e => e.source === id).forEach(e => walk(e.target));
      const node = byId.get(id);
      if (node?.type === "goto" && node.data?.target) walk(String(node.data.target));
    };
    walk(starts[0].id);
    graph.nodes.filter(n => n.type !== "comment" && !seen.has(n.id)).forEach(n => warn("Este bloco não está ligado ao início e nunca será usado.", n.id));
  }

  // a loop made only of blocks that never wait would spin forever
  const state = new Map<string, number>();
  let loop = false;
  const dfs = (id: string) => {
    const node = byId.get(id);
    if (!node || WAITING.includes(node.type) || TERMINAL.includes(node.type)) return;
    if (state.get(id) === 1) {
      loop = true;
      return;
    }
    if (state.get(id) === 2) return;
    state.set(id, 1);
    graph.edges.filter(e => e.source === id).forEach(e => dfs(e.target));
    if (node.type === "goto" && node.data?.target) dfs(String(node.data.target));
    state.set(id, 2);
  };
  graph.nodes.forEach(n => dfs(n.id));
  if (loop) err("Há um ciclo de blocos que nunca espera a pessoa responder. Coloque uma pergunta ou uma espera no meio dele.");
  return issues;
};
