import axios from "axios";

import AppError from "../../errors/AppError";
import LeadStage from "../../models/LeadStage";
import Queue from "../../models/Queue";
import Tag from "../../models/Tag";
import { anthropicAccess } from "../AiServices/Keys";
import { logUsage } from "../AiServices/Usage";
import { normalize } from "./Engine";
import { FlowEdge, FlowNode, Graph, Issue, validateGraph } from "./Graph";
import { BUILTIN_TOOLS, FIELD_TYPES, FIXED_EXITS, cleanStage, slug } from "./StageSpec";
import { autoLayout } from "./Templates";

// "Create the agent with AI": a description of the business becomes an agent (persona, answers for the knowledge base) and its
// blocks (AI stages, exits, CRM actions). The model answers through a tool with a schema (so the answer is always a structure), the
// result is cleaned and checked with the same rules as a published agent, and when something is wrong the problems go back to the
// model so it fixes them (up to two times) before the person ever sees the draft.
const ANTHROPIC_URL = () => process.env.ANTHROPIC_API_URL || "https://api.anthropic.com";
const TOOL = "criar_agente";
const MAX_ATTEMPTS = 3;

const SYSTEM = `Você desenha agentes de IA que atendem pessoas por WhatsApp (agentes desenhados por blocos). Responda SEMPRE chamando a ferramenta ${TOOL}, sem texto fora dela.

Como um agente funciona:
- O agente tem uma identidade (papel, tom, regras, proibições) e uma base de conhecimento (perguntas frequentes).
- O desenho é um caminho de blocos. O bloco principal é a ETAPA COM IA (tipo "stage"): a IA conversa com a pessoa até cumprir um objetivo. Cada etapa tem objetivo, instruções, campos a descobrir (tipados), ferramentas e saídas.
- Toda etapa tem as saídas: "done" (objetivo cumprido: ligue sempre), "human" (pediu uma pessoa), "off" (fora do escopo, a IA não sabe), "limit" (muitas voltas). Se human/off/limit não forem ligadas, a conversa vai para a equipe com um resumo (isso é bom: só ligue se houver algo melhor a fazer). Você pode criar saídas por intenção ("saidas": id curto, rotulo, quando) para rotear: ex. "quer_preco" quando a pessoa perguntar valores.
- Outros blocos: start (um só, primeiro), message (texto fixo), condition (desvia por campo: var:NOME, tag, lead.course, lead.city, hours, channel), crm (acoes: send_to_crm, move_stage com etapa_funil, add_tag com etiqueta, create_task com titulo_tarefa e minutos, add_note com texto), transfer (para: polo_sales, polo_tutoria, queue com fila), delay (minutos), end (texto, fechar).
- Ferramentas embutidas de uma etapa ("ferramentas"): buscar_curso, listar_polos, simular_bolsa (só para instituições de ensino). Ferramentas externas ("ferramentas_http") só se a descrição pedir uma integração; use um endereço https de exemplo e explique na descrição.

Regras: português do Brasil; textos curtos e humanos; nunca prometa valores, descontos ou prazos; no máximo 8 blocos; comece em start e ligue todos os blocos; todo bloco que não encerra precisa de ligação de saída; coloque 3 a 6 perguntas frequentes realistas na base. Campos com tipo: text, number, email, phone, choice (com opcoes), date.`;

const TOOL_SCHEMA = {
  name: TOOL,
  description: "Cria o agente de IA com a identidade, a base de conhecimento e os blocos.",
  input_schema: {
    type: "object",
    required: ["nome", "papel", "blocos", "ligacoes"],
    properties: {
      nome: { type: "string", description: "Nome curto do agente" },
      papel: { type: "string", description: "Quem o agente é e o que faz, em 2 ou 3 frases (vira o prompt de sistema)" },
      tom: { type: "string" },
      regras: { type: "string", description: "Regras do atendimento, uma por linha" },
      proibido: { type: "string", description: "O que o agente nunca deve fazer, uma por linha" },
      mensagem_transferencia: { type: "string", description: "O que dizer antes de passar para uma pessoa" },
      mensagem_desconhecido: { type: "string", description: "O que dizer quando não souber algo" },
      perguntas_frequentes: {
        type: "array",
        items: { type: "object", required: ["pergunta", "resposta"], properties: { pergunta: { type: "string" }, resposta: { type: "string" }, palavras_chave: { type: "string" } } }
      },
      blocos: {
        type: "array",
        items: {
          type: "object",
          required: ["chave", "tipo"],
          properties: {
            chave: { type: "string" },
            tipo: { type: "string", enum: ["start", "message", "stage", "condition", "crm", "transfer", "delay", "end"] },
            texto: { type: "string" },
            titulo: { type: "string" },
            objetivo: { type: "string" },
            instrucoes: { type: "string" },
            abertura: { type: "string", description: "Primeira mensagem fixa da etapa (opcional)" },
            usar_conhecimento: { type: "boolean" },
            max_turnos: { type: "number" },
            ferramentas: { type: "array", items: { type: "string", enum: [...BUILTIN_TOOLS] } },
            campos: {
              type: "array",
              items: {
                type: "object",
                required: ["chave", "rotulo"],
                properties: {
                  chave: { type: "string" },
                  rotulo: { type: "string" },
                  tipo: { type: "string", enum: [...FIELD_TYPES] },
                  obrigatorio: { type: "boolean" },
                  opcoes: { type: "array", items: { type: "string" } },
                  como_perguntar: { type: "string" }
                }
              }
            },
            saidas: { type: "array", items: { type: "object", required: ["id", "rotulo", "quando"], properties: { id: { type: "string" }, rotulo: { type: "string" }, quando: { type: "string" } } } },
            ferramentas_http: {
              type: "array",
              items: {
                type: "object",
                required: ["nome", "descricao", "url"],
                properties: {
                  nome: { type: "string" },
                  descricao: { type: "string" },
                  url: { type: "string" },
                  metodo: { type: "string", enum: ["GET", "POST"] },
                  parametros: { type: "array", items: { type: "object", required: ["nome"], properties: { nome: { type: "string" }, descricao: { type: "string" }, tipo: { type: "string", enum: ["string", "number"] }, obrigatorio: { type: "boolean" } } } }
                }
              }
            },
            acao: { type: "string", enum: ["send_to_crm", "move_stage", "add_tag", "remove_tag", "add_note", "create_task"] },
            etapa_funil: { type: "string" },
            etiqueta: { type: "string" },
            titulo_tarefa: { type: "string" },
            minutos: { type: "number" },
            para: { type: "string", enum: ["polo_sales", "polo_tutoria", "queue"] },
            fila: { type: "string" },
            regras: { type: "array", items: { type: "object", required: ["rotulo", "campo", "op"], properties: { rotulo: { type: "string" }, campo: { type: "string" }, op: { type: "string" }, valor: { type: "string" } } } },
            fechar: { type: "boolean" }
          }
        }
      },
      ligacoes: {
        type: "array",
        items: {
          type: "object",
          required: ["de", "para"],
          properties: { de: { type: "string" }, para: { type: "string" }, saida: { type: "string", description: "Para etapas: done, human, off, limit ou o id de uma saída por intenção. Para condições: o rótulo da regra ou 'senão'." } }
        }
      }
    }
  }
};

export interface GeneratedAgent {
  name: string;
  persona: { systemPrompt: string; tone: string; rules: string; forbidden: string; handoffMessage: string; unknownMessage: string };
  faq: Array<{ title: string; content: string; keywords?: string }>;
  graph: Graph;
}

const idLike = (s: string): string => String(s || "").replace(/[^\w-]/g, "").slice(0, 40) || "n";
const text = (v: any, n: number): string => String(v ?? "").trim().slice(0, n);

const pickByName = <T extends { name: string; id: number }>(list: T[], name?: string): number | null => {
  if (!name) return null;
  const n = normalize(name);
  const hit = list.find(x => normalize(x.name) === n) || list.find(x => normalize(x.name).includes(n) || n.includes(normalize(x.name)));
  return hit ? hit.id : null;
};

// What the model returned, turned into an agent the builder understands. Anything unknown is dropped, never trusted.
export const normalizeAgent = async (raw: any): Promise<GeneratedAgent> => {
  const [stages, tags, queues] = await Promise.all([LeadStage.findAll(), Tag.findAll(), Queue.findAll()]);
  const nodes: FlowNode[] = [];
  const keyToId = new Map<string, string>();
  (Array.isArray(raw?.blocos) ? raw.blocos : []).slice(0, 12).forEach((r: any, i: number) => {
    const type = String(r?.tipo || "");
    if (!["start", "message", "stage", "condition", "crm", "transfer", "delay", "end"].includes(type)) return;
    const key = String(r?.chave ?? `${type}${i}`);
    if (keyToId.has(key)) return;
    const id = idLike(key);
    keyToId.set(key, id);
    let data: any = {};
    switch (type) {
      case "message": data = { text: text(r.texto, 1000) }; break;
      case "stage":
        data = cleanStage({
          title: r.titulo,
          objective: r.objetivo,
          instructions: r.instrucoes,
          opening: r.abertura,
          useKnowledge: r.usar_conhecimento !== false,
          maxTurns: r.max_turnos,
          tools: r.ferramentas,
          fields: (Array.isArray(r.campos) ? r.campos : []).map((c: any) => ({ key: c?.chave, label: c?.rotulo, type: c?.tipo, required: !!c?.obrigatorio, options: c?.opcoes, ask: c?.como_perguntar })),
          outcomes: (Array.isArray(r.saidas) ? r.saidas : []).map((o: any) => ({ id: o?.id, label: o?.rotulo, when: o?.quando })),
          http: (Array.isArray(r.ferramentas_http) ? r.ferramentas_http : []).map((t: any) => ({
            name: t?.nome, description: t?.descricao, url: t?.url, method: t?.metodo,
            params: (Array.isArray(t?.parametros) ? t.parametros : []).map((p: any) => ({ name: p?.nome, description: p?.descricao, type: p?.tipo, required: !!p?.obrigatorio }))
          }))
        });
        break;
      case "condition":
        data = {
          rules: (Array.isArray(r.regras) ? r.regras : []).slice(0, 8).map((x: any, k: number) => ({
            id: `r${k + 1}`,
            label: text(x?.rotulo || `Condição ${k + 1}`, 40),
            all: [{ field: text(x?.campo || "tag", 60), op: ["eq", "neq", "contains", "notcontains", "in", "empty", "notempty"].includes(x?.op) ? x.op : "eq", value: text(x?.valor, 200) }]
          }))
        };
        break;
      case "crm":
        data = {
          action: ["send_to_crm", "move_stage", "add_tag", "remove_tag", "add_note", "create_task"].includes(r.acao) ? r.acao : "send_to_crm",
          source: "Agente de IA",
          ...(r.etapa_funil ? { stageId: pickByName(stages, r.etapa_funil) } : {}),
          ...(r.etiqueta ? { tagId: pickByName(tags, r.etiqueta) } : {}),
          ...(r.titulo_tarefa ? { title: text(r.titulo_tarefa, 160) } : {}),
          ...(r.minutos ? { minutes: Number(r.minutos) || 60 } : {}),
          ...(r.texto ? { text: text(r.texto, 1000) } : {})
        };
        break;
      case "transfer": {
        const to = ["polo_sales", "polo_tutoria", "queue"].includes(r.para) ? r.para : "polo_sales";
        data = { to, ...(to === "queue" ? { queueId: pickByName(queues, r.fila) } : {}), ...(r.texto ? { text: text(r.texto, 500) } : {}) };
        break;
      }
      case "delay": data = { minutes: Math.max(1, Number(r.minutos) || 5) }; break;
      case "end": data = { ...(r.texto ? { text: text(r.texto, 500) } : {}), ...(r.fechar ? { close: true } : {}) }; break;
      default: break;
    }
    nodes.push({ id, type, data });
  });
  if (!nodes.some(n => n.type === "start")) nodes.unshift({ id: "start", type: "start", data: {} });

  const handleOf = (node: FlowNode, hint?: string): string | null => {
    const h = normalize(hint || "");
    if (node.type === "stage") {
      if ((FIXED_EXITS as readonly string[]).includes(h)) return h;
      if (!h) return "done";
      const hit = (node.data.outcomes || []).find((o: any) => o.id === slug(hint, 30) || normalize(o.label) === h);
      return hit ? hit.id : null;
    }
    if (node.type === "condition") {
      if (["senao", "else", "caso contrario"].includes(h)) return "else";
      const hit = (node.data.rules || []).find((r: any) => normalize(r.label) === h);
      return hit ? hit.id : null;
    }
    return null;
  };
  const edges: FlowEdge[] = [];
  (Array.isArray(raw?.ligacoes) ? raw.ligacoes : []).slice(0, 40).forEach((e: any, i: number) => {
    const from = keyToId.get(String(e?.de)) || (String(e?.de) === "start" ? "start" : null);
    const to = keyToId.get(String(e?.para));
    if (!from || !to) return;
    const source = nodes.find(n => n.id === from) as FlowNode;
    const handle = handleOf(source, e?.saida);
    if (["stage", "condition"].includes(source.type) && !handle) return;
    edges.push({ id: `e${i}`, source: from, target: to, sourceHandle: handle });
  });

  const faq = (Array.isArray(raw?.perguntas_frequentes) ? raw.perguntas_frequentes : [])
    .slice(0, 12)
    .map((f: any) => ({ title: text(f?.pergunta, 250), content: text(f?.resposta, 2000), keywords: text(f?.palavras_chave, 200) || undefined }))
    .filter((f: any) => f.title && f.content);
  return {
    name: text(raw?.nome, 80) || "Agente gerado",
    persona: {
      systemPrompt: text(raw?.papel, 1500),
      tone: text(raw?.tom, 300),
      rules: text(raw?.regras, 1500),
      forbidden: text(raw?.proibido, 1000),
      handoffMessage: text(raw?.mensagem_transferencia, 300) || "Vou chamar um de nossos atendentes para continuar com você. Um momento, por favor.",
      unknownMessage: text(raw?.mensagem_desconhecido, 300) || "Ótima pergunta! Vou confirmar essa informação com a nossa equipe e já te respondo. 🙂"
    },
    faq,
    graph: autoLayout({ nodes, edges })
  };
};

const errorsOf = (graph: Graph): Issue[] => validateGraph(graph, { hasAiAgent: true, kind: "agent" }).filter(i => i.level === "error");

export const generateAgent = async (description: string, segment?: string): Promise<{ agent: GeneratedAgent; attempts: number; issues: Issue[] }> => {
  const { apiKey, model } = await anthropicAccess();
  if (!apiKey) throw new AppError("ERR_AI_NO_KEY", 400);
  const [stages, tags, queues] = await Promise.all([LeadStage.findAll(), Tag.findAll(), Queue.findAll()]);
  const context = [
    `Etapas do funil do CRM: ${stages.map(s => s.name).join(", ") || "nenhuma"}`,
    `Etiquetas: ${tags.map(t => t.name).join(", ") || "nenhuma"}`,
    `Filas: ${queues.map(q => q.name).join(", ") || "nenhuma"}`
  ].join("\n");
  const messages: any[] = [{ role: "user", content: `${context}\n\n${segment ? `Segmento: ${text(segment, 80)}\n\n` : ""}Descrição do agente:\n${text(description, 3000)}` }];
  let last: GeneratedAgent | null = null;
  let issues: Issue[] = [];
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    let data: any;
    try {
      // eslint-disable-next-line no-await-in-loop
      ({ data } = await axios.post(
        `${ANTHROPIC_URL()}/v1/messages`,
        { model, max_tokens: 6000, system: SYSTEM, tools: [TOOL_SCHEMA], tool_choice: { type: "tool", name: TOOL }, messages },
        { headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" }, timeout: 120000 }
      ));
    } catch (err) {
      if (last) break;
      throw new AppError("ERR_AI_FAILED", 502);
    }
    // eslint-disable-next-line no-await-in-loop
    await logUsage({ agentId: null, ticketId: null, model, kind: "test", usage: data?.usage }).catch(() => undefined);
    const call = (data?.content || []).find((b: any) => b.type === "tool_use" && b.name === TOOL);
    if (!call?.input) {
      if (last) break;
      throw new AppError("ERR_AI_BAD_ANSWER", 502);
    }
    // eslint-disable-next-line no-await-in-loop
    last = await normalizeAgent(call.input);
    issues = errorsOf(last.graph);
    if (!issues.length) return { agent: last, attempts: attempt, issues: [] };
    // the problems go back to the model, which fixes them
    messages.push({ role: "assistant", content: data.content });
    messages.push({
      role: "user",
      content: [{
        type: "tool_result",
        tool_use_id: call.id,
        is_error: true,
        content: `O desenho tem problemas que impedem a publicação:\n${issues.map(i => `- ${i.text}`).join("\n")}\nCorrija e chame ${TOOL} de novo com o agente completo.`
      }]
    });
  }
  if (!last) throw new AppError("ERR_AI_BAD_ANSWER", 502);
  // still with problems after the attempts: the person gets the draft and the list of what to fix
  return { agent: last, attempts: MAX_ATTEMPTS, issues };
};
