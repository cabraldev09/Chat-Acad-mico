import React, { useEffect } from "react";
import { Handle, Position, useUpdateNodeInternals } from "react-flow-renderer";
import {
  Bot, CornerDownRight, Database, Flag, GitBranch, ListChecks, MapPin, MessageSquare, Play, Shuffle, StickyNote, TextCursorInput, Timer, UserCog, Webhook,
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
  transfer: { title: "Transferir", icon: UserCog, color: "#ea580c", hint: "Passa para uma fila, atendente ou tutoria." },
  webhook: { title: "Webhook", icon: Webhook, color: "#475569", hint: "Avisa outro sistema." },
  random: { title: "Teste A/B", icon: Shuffle, color: "#9333ea", hint: "Divide as pessoas entre caminhos." },
  goto: { title: "Ir para", icon: CornerDownRight, color: "#64748b", hint: "Volta para outro bloco." },
  end: { title: "Fim", icon: Flag, color: "#475569", hint: "Encerra o fluxo (e pode finalizar a conversa)." },
  comment: { title: "Comentário", icon: StickyNote, color: "#ca8a04", hint: "Anotação para a equipe. Não aparece para ninguém." },
};

export const PALETTE = [
  ["Conversa", ["message", "buttons", "ask", "polo"]],
  ["Lógica", ["condition", "random", "delay", "goto"]],
  ["CRM e equipe", ["crm", "transfer", "ai"]],
  ["Integração", ["webhook", "end", "comment"]],
];

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
  const exitsKey = JSON.stringify([(data.options || []).map((o) => o.id), (data.rules || []).map((r) => r.id), (data.branches || []).map((x) => x.id)]);
  useEffect(() => { update(id); }, [exitsKey, id, update]);
  const stat = data.__stat;
  const border = data.__active ? "#FEF84C" : data.__issue === "error" ? "#dc2626" : data.__issue === "warning" ? "#d97706" : selected ? b.color : "rgba(127,140,160,.35)";
  const comment = type === "comment";
  return (
    <div style={{
      width: type === "buttons" || type === "condition" ? 280 : 250, borderRadius: 14, overflow: "visible", background: comment ? "#fff8c5" : "var(--card, #fff)", color: comment ? "#5c4b00" : "inherit",
      border: `2px solid ${border}`, boxShadow: data.__active ? "0 0 0 4px rgba(254,248,76,.55)" : "0 4px 14px rgba(11,66,121,.12)", fontFamily: "inherit",
    }}>
      {type !== "start" && !comment && <Handle type="target" position={Position.Left} style={{ ...handleStyle, left: -6, right: "auto", top: 22 }} />}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: comment ? "transparent" : b.color, color: comment ? "inherit" : "#fff", borderRadius: "12px 12px 0 0", fontWeight: 700, fontSize: 13 }}>
        <Icon size={15} /> <span style={{ flex: 1 }}>{b.title}</span>
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
      {type === "webhook" && (
        <>
          <Exit id="out" label="Deu certo" />
          <Exit id="error" label="Se falhar" muted />
        </>
      )}
      {["start", "message", "ask", "crm", "delay"].includes(type) && (
        <Handle type="source" position={Position.Right} id="out" style={{ ...handleStyle, top: 22 }} />
      )}
    </div>
  );
};

export const nodeTypes = Object.keys(BLOCKS).reduce((o, t) => ({ ...o, [t]: (props) => <FlowNode {...props} type={t} /> }), {});
