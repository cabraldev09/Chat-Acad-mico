import axios from "axios";

import AppError from "../../errors/AppError";
import { getSetting } from "../../helpers/AppSettings";
import AiAgent from "../../models/AiAgent";
import LeadStage from "../../models/LeadStage";
import Polo from "../../models/Polo";
import Queue from "../../models/Queue";
import Tag from "../../models/Tag";
import { logUsage } from "../AiServices/Usage";
import { normalize } from "./Engine";
import { FlowEdge, FlowNode, Graph, NODE_TYPES } from "./Graph";
import { autoLayout } from "./Templates";

const ANTHROPIC_URL = () => process.env.ANTHROPIC_API_URL || "https://api.anthropic.com";
const DEFAULT_MODEL = "claude-sonnet-5-5";

const SYSTEM = `Você desenha fluxos de atendimento por WhatsApp para uma instituição de ensino superior (Cruzeiro do Sul Virtual). Responda APENAS com um JSON, sem texto antes ou depois.

Formato:
{"name": "nome curto do fluxo", "entry": {"type": "first_message" | "keyword" | "any", "keywords": ["palavra"]}, "nodes": [...], "edges": [...]}

Blocos (campo "type"); todo bloco tem "key" único (texto curto sem espaços):
- start: início. Exatamente um.
- message: {"text"} envia um texto.
- buttons: {"text", "options": ["Opção 1", "Opção 2"], "saveTo"?} pergunta com opções que a pessoa escolhe (2 a 8). O texto das opções é curto.
- ask: {"text", "field", "validate"} pergunta aberta. field: nome, email, cidade, curso, modalidade, forma_ingresso ou um nome livre sem espaços. validate: text, email, phone ou number.
- polo: {"text"} pergunta qual polo a pessoa prefere (lista os polos ativos, entende número, nome e cidade, mesmo com erro de digitação) e guarda o polo no lead. Saída "outra resposta" para quando não for entendido. Depois dele, a variável var:polo tem o nome do polo.
- condition: {"rules": [{"label", "field", "op", "value"}]} desvia o caminho. field: hours (valor open/closed), tag, lead.course, lead.polo, lead.stage, lead.city, channel, ou var:NOME. op: eq, neq, contains, notcontains, in (valor com vários itens separados por vírgula), empty, notempty.
- crm: {"action", ...} ações: send_to_crm (cria ou atualiza o lead com o que foi coletado; aceita "stageName", "tagName", "ownerMode":"roundrobin"), move_stage ("stageName"), add_tag/remove_tag ("tagName"), add_note ("text"), create_task ("title", "minutes").
- delay: {"minutes"} espera e continua.
- ai: {} passa a conversa para o agente de IA e encerra o fluxo.
- transfer: {"to": "queue" | "polo_sales" | "polo_tutoria" | "chosen_polo_sales" (comercial do polo escolhido no bloco polo), "queueName"?, "text"?} passa para uma pessoa e encerra o fluxo.
- webhook: {"url"}.
- random: {"branches": [{"label", "weight"}]} teste A/B.
- end: {"text"?, "close"?: true} encerra.

Ligações: {"from": "key", "to": "key", "option"?: "texto da opção, da condição ou do ramo, ou 'senão' / 'outra resposta'"}. Todo bloco que não encerra precisa de ligação de saída; em buttons, condition e random cada opção precisa da sua ligação.

Regras: textos em português do Brasil, curtos e simpáticos, sem prometer valores, bolsas ou mensalidade fixa. Use buttons sempre que a pessoa escolher entre poucas opções. Antes de passar para uma pessoa, colete o necessário e use crm/send_to_crm quando houver interesse em matrícula. Não passe de 20 blocos.`;

const idLike = (s: string) => String(s || "").replace(/[^\w-]/g, "").slice(0, 40) || "n";

const pickByName = <T extends { name: string; id: number }>(list: T[], name?: string): number | null => {
  if (!name) return null;
  const n = normalize(name);
  const hit = list.find(x => normalize(x.name) === n) || list.find(x => normalize(x.name).includes(n) || n.includes(normalize(x.name)));
  return hit ? hit.id : null;
};

const optionIdOf = (node: FlowNode, hint: string | undefined): string | null => {
  const h = normalize(hint || "");
  if (node.type === "buttons") {
    if (["outra resposta", "outro", "other"].includes(h)) return "other";
    const o = (node.data.options || []).find((x: any) => normalize(x.label) === h);
    return o ? o.id : null;
  }
  if (node.type === "condition") {
    if (["senao", "else", "caso contrario"].includes(h)) return "else";
    const r = (node.data.rules || []).find((x: any) => normalize(x.label) === h);
    return r ? r.id : null;
  }
  if (node.type === "random") {
    const b = (node.data.branches || []).find((x: any) => normalize(x.label) === h);
    return b ? b.id : null;
  }
  if (node.type === "webhook" && ["erro", "error", "falha"].includes(h)) return "error";
  return null;
};

// What the model returned, turned into a flow the canvas understands. Anything unknown is dropped, never trusted.
export const normalizeGenerated = async (raw: any): Promise<{ name: string; entry: any; graph: Graph }> => {
  const [stages, tags, queues] = await Promise.all([LeadStage.findAll(), Tag.findAll(), Queue.findAll()]);
  void Polo;
  const nodes: FlowNode[] = [];
  const keyToId = new Map<string, string>();
  (Array.isArray(raw?.nodes) ? raw.nodes : []).slice(0, 30).forEach((r: any, i: number) => {
    if (!r || !NODE_TYPES.includes(r.type) || r.type === "comment" || r.type === "goto") return;
    const id = idLike(r.key || `${r.type}${i}`);
    if (keyToId.has(String(r.key))) return;
    keyToId.set(String(r.key), id);
    const d: any = {};
    switch (r.type) {
      case "message": d.text = String(r.text || ""); break;
      case "buttons":
        d.text = String(r.text || "");
        d.options = (Array.isArray(r.options) ? r.options : []).slice(0, 10).map((o: any, k: number) => ({ id: `o${k + 1}`, label: String(typeof o === "string" ? o : o?.label || "").slice(0, 40) }));
        if (r.saveTo) d.saveTo = idLike(r.saveTo);
        break;
      case "polo": d.text = String(r.text || "Qual polo fica mais perto de você?"); break;
      case "ask":
        d.text = String(r.text || "");
        d.field = idLike(r.field || "nome");
        d.validate = ["text", "email", "phone", "number"].includes(r.validate) ? r.validate : "text";
        break;
      case "condition":
        d.rules = (Array.isArray(r.rules) ? r.rules : []).slice(0, 8).map((x: any, k: number) => ({
          id: `r${k + 1}`,
          label: String(x?.label || `Condição ${k + 1}`).slice(0, 40),
          all: [{ field: String(x?.field || "tag"), op: ["eq", "neq", "contains", "notcontains", "in", "empty", "notempty"].includes(x?.op) ? x.op : "eq", value: String(x?.value ?? "") }]
        }));
        break;
      case "crm":
        d.action = ["send_to_crm", "move_stage", "add_tag", "remove_tag", "add_note", "create_task", "set_owner", "set_polo"].includes(r.action) ? r.action : "send_to_crm";
        if (r.stageName) d.stageId = pickByName(stages, r.stageName);
        if (r.tagName) d.tagId = pickByName(tags, r.tagName);
        if (r.ownerMode === "roundrobin") d.ownerMode = "roundrobin";
        if (r.text) d.text = String(r.text);
        if (r.title) d.title = String(r.title);
        if (r.minutes) d.minutes = Number(r.minutes) || 60;
        d.source = "Chatbot";
        break;
      case "delay": d.minutes = Math.max(1, Number(r.minutes) || 5); break;
      case "transfer":
        d.to = ["queue", "polo_sales", "polo_tutoria", "chosen_polo_sales", "user"].includes(r.to) ? r.to : "polo_sales";
        if (d.to === "queue") d.queueId = pickByName(queues, r.queueName);
        if (r.text) d.text = String(r.text);
        break;
      case "webhook": d.url = String(r.url || ""); break;
      case "random":
        d.branches = (Array.isArray(r.branches) ? r.branches : []).slice(0, 6).map((b: any, k: number) => ({ id: `b${k + 1}`, label: String(b?.label || `Ramo ${k + 1}`).slice(0, 30), weight: Number(b?.weight) || 1 }));
        break;
      case "end":
        if (r.text) d.text = String(r.text);
        if (r.close) d.close = true;
        break;
      default:
        break;
    }
    nodes.push({ id, type: r.type, data: d });
  });
  if (!nodes.some(n => n.type === "start")) nodes.unshift({ id: "start", type: "start", data: {} });

  const edges: FlowEdge[] = [];
  (Array.isArray(raw?.edges) ? raw.edges : []).slice(0, 80).forEach((e: any, i: number) => {
    const from = keyToId.get(String(e?.from)) || (nodes.find(n => n.type === "start" && String(e?.from) === "start") ? "start" : null);
    const to = keyToId.get(String(e?.to));
    if (!from || !to) return;
    const source = nodes.find(n => n.id === from) as FlowNode;
    const handle = optionIdOf(source, e?.option);
    // a block with several exits needs a known option; an unknown one is skipped (the validation will point at it)
    if (["buttons", "condition", "random"].includes(source.type) && !handle) return;
    edges.push({ id: `e${i}`, source: from, target: to, sourceHandle: handle });
  });

  const type = ["first_message", "keyword", "any"].includes(raw?.entry?.type) ? raw.entry.type : "first_message";
  return {
    name: String(raw?.name || "Fluxo gerado").slice(0, 80),
    entry: { type, keywords: type === "keyword" ? (Array.isArray(raw?.entry?.keywords) ? raw.entry.keywords.map(String).slice(0, 10) : []) : [] },
    graph: autoLayout({ nodes, edges })
  };
};

export const generateFlow = async (description: string): Promise<{ name: string; entry: any; graph: Graph }> => {
  const agent = await AiAgent.findOne({ where: { provider: "anthropic" } as any, order: [["id", "ASC"]] });
  const apiKey = (await getSetting("ai_anthropic_key", "")) || agent?.apiKey || "";
  if (!apiKey) throw new AppError("ERR_AI_NO_KEY", 400);
  const [stages, tags, queues] = await Promise.all([LeadStage.findAll(), Tag.findAll(), Queue.findAll()]);
  const context = [
    `Etapas do funil: ${stages.map(s => s.name).join(", ") || "nenhuma"}`,
    `Etiquetas: ${tags.map(t => t.name).join(", ") || "nenhuma"}`,
    `Filas: ${queues.map(q => q.name).join(", ") || "nenhuma"}`
  ].join("\n");
  const model = agent?.model || DEFAULT_MODEL;
  let data: any;
  try {
    ({ data } = await axios.post(
      `${ANTHROPIC_URL()}/v1/messages`,
      { model, max_tokens: 4000, system: SYSTEM, messages: [{ role: "user", content: `${context}\n\nDescrição do fluxo:\n${String(description).slice(0, 3000)}` }] },
      { headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" }, timeout: 90000 }
    ));
  } catch (err) {
    throw new AppError("ERR_AI_FAILED", 502);
  }
  await logUsage({ agentId: null, ticketId: null, model, kind: "test", usage: data?.usage }).catch(() => undefined);
  const text: string = (data?.content || []).map((b: any) => b?.text || "").join("");
  const a = text.indexOf("{");
  const b = text.lastIndexOf("}");
  if (a < 0 || b <= a) throw new AppError("ERR_AI_BAD_ANSWER", 502);
  let raw: any;
  try {
    raw = JSON.parse(text.slice(a, b + 1));
  } catch (e) {
    throw new AppError("ERR_AI_BAD_ANSWER", 502);
  }
  return normalizeGenerated(raw);
};
