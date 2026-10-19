import React, { useEffect } from "react";
import { Handle, Position, useUpdateNodeInternals } from "react-flow-renderer";
import {
  Bot, CornerDownRight, Database, Flag, GitBranch, ListChecks, MapPin, MessageSquare, Play, Shuffle, Sparkles, StickyNote, TextCursorInput, Timer, TrendingUp, UserCog, Webhook, Workflow,
} from "lucide-react";

// The blocks of a flow: what each one is called, how it looks and what it starts with.
export const BLOCKS = {
  start: { title: "Início", icon: Play, color: "#0B4279", hint: "Onde a conversa começa." },
  message: { title: "Mensagem", icon: MessageSquare, color: "#0693E3", hint: "Envia um texto." },
  buttons: { title: "Pergunta com botões", icon: ListChecks, color: "#7c3aed", hint: "A pessoa escolhe uma opção." },
  ask: { title: "Pergunta aberta", icon: TextCursorInput, color: "#0891b2", hint: "A pessoa responde com texto; a resposta é guardada." },
  polo: { title: "Escolher polo", icon: MapPin, color: "#0d9488", hint: "A pessoa escolhe o polo; o lead e a conversa vão para ele." },
  condition: { title: "Condição", icon: GitBranch, color: "#d97706", hint: "Muda o caminho conforme os dados." },
  crm: { title: "Ação no CRM", icon: Database, color: "#16a34a", hint: "Envia ao CRM, muda de etapa, etiqueta, tarefa…" },
  delay: { title: "Espera", icon: Timer, color: "#64748b", hint: "Espera um tempo e continua." },
  ai: { title: "Agente de IA", icon: Bot, color: "#db2777", hint: "Passa a conversa para o agente de IA." },
  stage: { title: "Etapa com IA", icon: Sparkles, color: "#be185d", hint: "A IA conversa até cumprir um objetivo: pergunta o que falta, usa ferramentas e sai pelo caminho certo." },
  commercial: { title: "Estado comercial", icon: TrendingUp, color: "#0f766e", hint: "Um passo da jornada comercial: coluna do funil, tarefa, nota, resumo para o consultor ou análise curricular." },
  flow: { title: "Chamar fluxo", icon: Workflow, color: "#6d28d9", hint: "Começa outro fluxo publicado nesta mesma conversa." },
  transfer: { title: "Transferir", icon: UserCog, color: "#ea580c", hint: "Passa para uma fila, atendente ou tutoria." },
  webhook: { title: "Webhook", icon: Webhook, color: "#475569", hint: "Avisa outro sistema." },
  random: { title: "Teste A/B", icon: Shuffle, color: "#9333ea", hint: "Divide as pessoas entre caminhos." },
  goto: { title: "Ir para", icon: CornerDownRight, color: "#64748b", hint: "Volta para outro bloco." },
  end: { title: "Fim", icon: Flag, color: "#475569", hint: "Encerra o fluxo (e pode finalizar a conversa)." },
  comment: { title: "Comentário", icon: StickyNote, color: "#ca8a04", hint: "Anotação para a equipe. Não aparece para ninguém." },
};

// the blocks offered on the board: the agents are drawn with the same blocks as the chatbot, plus the steps of the commercial journey
export const paletteFor = (kind) => [
  ["Conversa", ["message", "buttons", "ask", "polo"]],
  ["Inteligência artificial", kind === "agent" ? ["stage", "flow"] : ["stage", "ai", "flow"]],
  ["Lógica", ["condition", "random", "delay", "goto"]],
  ["CRM e equipe", kind === "agent" ? ["commercial", "crm", "transfer"] : ["crm", "transfer"]],
  ["Integração", ["webhook", "end", "comment"]],
];
export const PALETTE = paletteFor("flow");

export const COMMERCIAL_OPS = {
  ensure_lead: "Receber o lead (achar ou criar, sem duplicar)",
  sync_stage: "Mover para uma coluna do funil",
  task: "Criar uma tarefa",
  note: "Registrar a nota do atendimento",
  handoff_brief: "Preparar o resumo para o consultor",
  start_analysis: "Iniciar a análise curricular com o histórico recebido",
};
// the steps of the journey the funnel of the agent knows (the agent can never put a lead in "Matriculado")
export const FUNNEL_KEYS = {
  new_lead: "Novo lead", contact_started: "Contato iniciado", in_service: "Em atendimento", qualified: "Qualificado", waiting_transcript: "Aguardando histórico",
  curricular_analysis: "Análise curricular", analysis_done: "Análise concluída", ready_for_proposal: "Pronto para proposta", proposal: "Proposta / negociação",
  enrollment_in_progress: "Matrícula em andamento", follow_up: "Follow-up", no_response: "Sem resposta", no_interest: "Sem interesse", human_service: "Atendimento humano",
};

let n = 0;
export const newId = (p = "n") => `${p}${Date.now().toString(36)}${(n += 1).toString(36)}`;

// what a new block starts with
export const defaultData = (type) => {
  switch (type) {
    case "message": return { text: "" };
    case "buttons": return { text: "", options: [{ id: newId("o"), label: "Opção 1" }, { id: newId("o"), label: "Opção 2" }] };
    case "ask": return { text: "", field: "nome", validate: "text" };
    case "polo": return { text: "Qual polo fica mais perto de você? Responda com o número, o nome ou a cidade." };
    case "condition": return { rules: [{ id: newId("r"), label: "Condição 1", all: [{ field: "hours", op: "eq", value: "closed" }] }] };
    case "crm": return { action: "send_to_crm", ownerMode: "roundrobin", source: "Chatbot" };
    case "delay": return { minutes: 5 };
    case "transfer": return { to: "polo_sales", text: "" };
    case "webhook": return { url: "" };
    case "random": return { branches: [{ id: newId("b"), label: "Caminho A", weight: 1 }, { id: newId("b"), label: "Caminho B", weight: 1 }] };
    case "goto": return { target: "" };
    case "end": return { text: "", close: false };
    case "ai": return { text: "" };
    case "stage": return { title: "Nova etapa", objective: "", instructions: "", opening: "", fields: [], tools: [], http: [], outcomes: [], useKnowledge: true, maxTurns: 12, hooks: [], historyTurns: 6, quiet: false };
    case "commercial": return { op: "sync_stage", stageKey: "in_service", title: "", reason: "" };
    case "flow": return { flowId: null };
    case "comment": return { text: "" };
    default: return {};
  }
};

const ACTIONS = {
  send_to_crm: "Enviar a conversa ao CRM", move_stage: "Mover de etapa", add_tag: "Colocar etiqueta", remove_tag: "Tirar etiqueta",
  set_owner: "Definir o responsável", set_polo: "Definir o polo", create_task: "Criar tarefa", add_note: "Registrar nota",
};
const TRANSFER = { queue: "Para uma fila", user: "Para um atendente", polo_sales: "Comercial do polo do aluno", chosen_polo_sales: "Comercial do polo escolhido no fluxo", polo_tutoria: "Tutoria do polo do aluno" };
export const ACTION_LABEL = ACTIONS;
export const TRANSFER_LABEL = TRANSFER;

const summary = (type, d) => {
  switch (type) {
    case "message": case "ask": case "ai": case "end": case "comment":
      return d.text || (type === "ask" ? "Escreva a pergunta" : type === "message" ? "Escreva a mensagem" : "");
    case "buttons": case "polo": return d.text || "Escreva a pergunta";
    case "crm": return ACTIONS[d.action] || "Escolha a ação";
    case "delay": return `Espera ${d.minutes || "?"} min`;
    case "transfer": return TRANSFER[d.to] || "Escolha o destino";
    case "webhook": return d.url || "Informe o endereço";
    case "goto": return d.target ? "Volta para outro bloco" : "Escolha o bloco";
    case "condition": return `${(d.rules || []).length} condição(ões)`;
    case "random": return "Divide as pessoas entre os caminhos";
    case "stage": {
      const bits = [`${(d.fields || []).length} dado(s)`, `${(d.tools || []).length + (d.http || []).length} ferramenta(s)`];
      if ((d.hooks || []).includes("commercial")) bits.push("CRM automático");
      return `${d.objective || "Escreva o objetivo da etapa"}\n${bits.join(" · ")}`;
    }
    case "commercial": return `${COMMERCIAL_OPS[d.op] || "Escolha o que fazer"}${d.op === "sync_stage" && d.stageKey ? `: ${FUNNEL_KEYS[d.stageKey] || d.stageKey}` : ""}${d.op === "task" && d.title ? `: ${d.title}` : ""}`;
    case "flow": return d.flowId ? "Começa outro fluxo" : "Escolha o fluxo";
    case "start": return "A conversa começa aqui";
    default: return "";
  }
};

const rowStyle = { position: "relative", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "6px 10px", borderTop: "1px solid rgba(127,140,160,.22)", fontSize: 12.5, minHeight: 30 };
const handleStyle = { width: 11, height: 11, background: "#fff", border: "2px solid #0693E3", right: -6 };

// one output of a block: a row with its own handle (so every option can lead somewhere else)
const Exit = ({ id, label, muted, count }) => (
  <div style={{ ...rowStyle, opacity: muted ? 0.7 : 1 }}>
    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
    {count ? <span style={{ fontSize: 11, opacity: 0.7 }}>{count}</span> : null}
    <Handle type="source" position={Position.Right} id={id} style={{ ...handleStyle, top: "50%" }} />
  </div>
);

const FlowNode = ({ id, type, data, selected }) => {
  const b = BLOCKS[type];
  const Icon = b.icon;
  const update = useUpdateNodeInternals();
  const exitsKey = JSON.stringify([(data.options || []).map((o) => o.id), (data.rules || []).map((r) => r.id), (data.branches || []).map((x) => x.id), (data.outcomes || []).map((o) => o.id)]);
  useEffect(() => { update(id); }, [exitsKey, id, update]);
  const stat = data.__stat;
  const border = data.__active ? "#FEF84C" : data.__issue === "error" ? "#dc2626" : data.__issue === "warning" ? "#d97706" : selected ? b.color : "rgba(127,140,160,.35)";
  const comment = type === "comment";
  return (
    <div style={{
      width: ["buttons", "condition", "stage"].includes(type) ? 280 : 250, borderRadius: 14, overflow: "visible", background: comment ? "#fff8c5" : "var(--card, #fff)", color: comment ? "#5c4b00" : "inherit",
      border: `2px solid ${border}`, boxShadow: data.__active ? "0 0 0 4px rgba(254,248,76,.55)" : "0 4px 14px rgba(11,66,121,.12)", fontFamily: "inherit",
    }}>
      {type !== "start" && !comment && <Handle type="target" position={Position.Left} style={{ ...handleStyle, left: -6, right: "auto", top: 22 }} />}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: comment ? "transparent" : b.color, color: comment ? "inherit" : "#fff", borderRadius: "12px 12px 0 0", fontWeight: 700, fontSize: 13 }}>
        <Icon size={15} /> <span style={{ flex: 1 }}>{["stage", "commercial"].includes(type) && data.title ? data.title : b.title}</span>
        {stat ? <span title="Pessoas que passaram por aqui" style={{ background: "rgba(255,255,255,.25)", borderRadius: 999, padding: "1px 8px", fontSize: 11.5 }}>{stat}</span> : null}
      </div>
      <div style={{ padding: "8px 10px", fontSize: 12.5, lineHeight: 1.4, opacity: summary(type, data) && !data.text && ["message", "ask", "buttons", "polo"].includes(type) ? 0.55 : 0.9, display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical", overflow: "hidden", whiteSpace: "pre-wrap" }}>
        {summary(type, data)}
      </div>
      {type === "buttons" && (
        <>
          {(data.options || []).map((o) => <Exit key={o.id} id={String(o.id)} label={o.label || "Opção sem nome"} />)}
          <Exit id="other" label="Resposta inesperada" muted />
        </>
      )}
      {type === "polo" && (
        <>
          <Exit id="out" label="Polo escolhido" />
          <Exit id="other" label="Não entendi o polo" muted />
        </>
      )}
      {type === "condition" && (
        <>
          {(data.rules || []).map((r) => <Exit key={r.id} id={String(r.id)} label={r.label || "Condição"} />)}
          <Exit id="else" label="Senão" muted />
        </>
      )}
      {type === "random" && (data.branches || []).map((x) => <Exit key={x.id} id={String(x.id)} label={`${x.label || "Caminho"} · peso ${x.weight || 1}`} />)}
      {type === "stage" && (
        <>
          <Exit id="done" label="Objetivo cumprido" />
          {(data.outcomes || []).map((o) => <Exit key={o.id} id={String(o.id)} label={o.label || o.id} />)}
          <Exit id="human" label="Pediu uma pessoa" muted />
          <Exit id="off" label="Fora do escopo" muted />
          <Exit id="limit" label="Limite de turnos" muted />
        </>
      )}
      {type === "webhook" && (
        <>
          <Exit id="out" label="Deu certo" />
          <Exit id="error" label="Se falhar" muted />
        </>
      )}
      {["start", "message", "ask", "crm", "delay", "commercial"].includes(type) && (
        <Handle type="source" position={Position.Right} id="out" style={{ ...handleStyle, top: 22 }} />
      )}
    </div>
  );
};

export const nodeTypes = Object.keys(BLOCKS).reduce((o, t) => ({ ...o, [t]: (props) => <FlowNode {...props} type={t} /> }), {});
