import axios from "axios";
import { Op } from "sequelize";

import AiAgent from "../../models/AiAgent";
import Message from "../../models/Message";
import Ticket from "../../models/Ticket";
import { getSetting } from "../../helpers/AppSettings";
import { logger } from "../../utils/logger";
import ShowTicketService from "../TicketServices/ShowTicketService";
import { ensureLegacy, matchFaq, searchChunks } from "./Kb";
import { logUsage, tokensToday } from "./Usage";
import { missingSlots, runTool, slotsOf, toolDefs } from "./Tools";
import { handoffToHuman, HandoffReason } from "./Handoff";

export const HANDOFF_MARKER = "[HANDOFF]";

const ANTHROPIC_URL = () => process.env.ANTHROPIC_API_URL || "https://api.anthropic.com";
const OPENAI_URL = () => process.env.OPENAI_API_URL || "https://api.openai.com";
const RECENT_TURNS = 6; // short memory: older context lives in the rolling summary
const SUMMARY_EVERY = 8; // answers between summary updates
const MAX_TOOL_ROUNDS = 3;

export const findAgentForTicket = async (ticket: Ticket): Promise<AiAgent | null> => {
  const agents = await AiAgent.findAll({ where: { active: true }, order: [["id", "ASC"]] });
  // most specific match first: queue, then connection, then global
  const byQueue = agents.find(a => a.queueId && ticket.queueId && a.queueId === ticket.queueId);
  const byConn = agents.find(a => !a.queueId && a.whatsappId && a.whatsappId === ticket.whatsappId);
  const global = agents.find(a => !a.queueId && !a.whatsappId);
  return byQueue || byConn || global || null;
};

interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

// The stable part of the prompt (the same for every message): cached by the provider, so it costs a fraction after the first call.
const staticPrompt = (agent: AiAgent): string => {
  const p = agent.persona || {};
  const parts = [
    agent.systemPrompt ||
      "Você é um assistente de matrículas de uma instituição de ensino superior. Atenda de forma humana, curta e objetiva.",
    p.tone ? `Tom de voz: ${p.tone}` : null,
    p.rules ? `Regras do atendimento:\n${p.rules}` : null,
    p.forbidden ? `Nunca faça isto:\n${p.forbidden}` : null,
    [
      "Regras fixas:",
      "- Responda em português do Brasil, em no máximo 3 frases curtas. Faça uma pergunta por vez.",
      "- Use as ferramentas para preços, cursos e polos. Nunca invente valores, datas ou condições.",
      "- Nunca diga que a mensalidade é fixa até o fim do curso nem fale em regressão de bolsa: valores e bolsa dependem da proposta oficial feita por um consultor.",
      "- Quando o aluno informar um dado novo (nome, cidade, curso...), chame salvar_lead.",
      "- Quando salvar_lead devolver completo=true, agradeça e avise que um consultor da equipe continua o atendimento.",
      `- Se não souber, se o aluno pedir uma pessoa ou o assunto exigir um humano, responda APENAS com ${HANDOFF_MARKER}.`
    ].join("\n")
  ];
  return parts.filter(Boolean).join("\n\n");
};

// The part that changes at every message: summary, what is already known and the few best passages.
const dynamicPrompt = (agent: AiAgent, summary: string | null, collected: Record<string, string>, passages: string[]): string => {
  const known = slotsOf(agent).filter(s => collected[s.key]).map(s => `${s.label}: ${collected[s.key]}`);
  const missing = missingSlots(agent, collected).map(s => s.label);
  return [
    summary ? `Resumo da conversa até aqui:\n${summary}` : null,
    known.length ? `Dados já coletados:\n${known.join("\n")}` : null,
    missing.length ? `Ainda falta descobrir: ${missing.join(", ")}.` : null,
    passages.length
      ? `Trechos da base de conhecimento (use somente o que estiver aqui para fatos da instituição):\n${passages.map((t, i) => `[${i + 1}] ${t}`).join("\n\n")}`
      : "Nenhum trecho da base de conhecimento corresponde a esta pergunta: se for um fato da instituição que você não conhece, passe para um atendente."
  ]
    .filter(Boolean)
    .join("\n\n");
};

const resolveKey = async (agent: AiAgent): Promise<string> => {
  if (agent.apiKey) return agent.apiKey;
  return getSetting(`ai_${agent.provider}_key`, "");
};

const callAnthropic = async (apiKey: string, body: any) => {
  const { data } = await axios.post(`${ANTHROPIC_URL()}/v1/messages`, body, {
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    timeout: 60000
  });
  return data;
};

export interface AiResult {
  text: string;
  handoff: boolean;
  tools: string[];
  collected: Record<string, string>;
  tokens: { input: number; output: number; cacheRead: number };
}

interface RespondOptions {
  ticket: Ticket | null;
  history: ChatTurn[];
  summary?: string | null;
  collected?: Record<string, string> | null;
  // the tester: no writes, usage kind "test"
  sandbox?: boolean;
}

// One answer: retrieval → prompt → model (with tools) → text. Both the live inbox and the tester use it.
export const respond = async (agent: AiAgent, opts: RespondOptions): Promise<AiResult> => {
  const apiKey = await resolveKey(agent);
  if (!apiKey) throw new Error("ERR_AI_NO_API_KEY");
  await ensureLegacy(agent);

  const collected: Record<string, string> = { ...(opts.collected || {}) };
  const lastUser = [...opts.history].reverse().find(t => t.role === "user");
  if (!lastUser) throw new Error("ERR_AI_NO_HISTORY");

  // question + the turn before it, so "e o valor?" still finds the course that was being discussed
  const prevUser = [...opts.history].reverse().filter(t => t.role === "user")[1];
  const hits = await searchChunks(agent.id, `${lastUser.content} ${prevUser ? prevUser.content : ""}`, 4);
  const passages = hits.map(h => h.content);

  const recent = opts.history.slice(-RECENT_TURNS);
  while (recent.length && recent[0].role !== "user") recent.shift();

  const tokens = { input: 0, output: 0, cacheRead: 0 };
  const toolsUsed: string[] = [];
  const kind = opts.sandbox ? "test" : "reply";
  let text = "";

  if (agent.provider === "openai") {
    const { data } = await axios.post(
      `${OPENAI_URL()}/v1/chat/completions`,
      {
        model: agent.model,
        max_tokens: agent.maxTokens || 350,
        messages: [
          { role: "system", content: `${staticPrompt(agent)}\n\n${dynamicPrompt(agent, opts.summary || null, collected, passages)}` },
          ...recent
        ]
      },
      { headers: { Authorization: `Bearer ${apiKey}` }, timeout: 60000 }
    );
    text = (data.choices?.[0]?.message?.content || "").trim();
    tokens.input += data.usage?.prompt_tokens || 0;
    tokens.output += data.usage?.completion_tokens || 0;
    await logUsage({ agentId: agent.id, ticketId: opts.ticket?.id, model: agent.model, kind, usage: data.usage });
    return { text, handoff: text.includes(HANDOFF_MARKER), tools: [], collected, tokens };
  }

  const messages: any[] = recent.map(t => ({ role: t.role, content: t.content }));
  const system = [
    { type: "text", text: staticPrompt(agent), cache_control: { type: "ephemeral" } },
    { type: "text", text: dynamicPrompt(agent, opts.summary || null, collected, passages) }
  ];
  const tools = toolDefs(agent);
  const ctx = { agent, ticket: opts.ticket, dryRun: !!opts.sandbox, collected };

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round += 1) {
    // eslint-disable-next-line no-await-in-loop
    const data = await callAnthropic(apiKey, {
      model: agent.model,
      max_tokens: agent.maxTokens || 350,
      system,
      messages,
      // after the last allowed round the model must answer in text
      ...(round < MAX_TOOL_ROUNDS ? { tools } : {})
    });
    tokens.input += data.usage?.input_tokens || 0;
    tokens.output += data.usage?.output_tokens || 0;
    tokens.cacheRead += data.usage?.cache_read_input_tokens || 0;
    // eslint-disable-next-line no-await-in-loop
    await logUsage({ agentId: agent.id, ticketId: opts.ticket?.id, model: agent.model, kind, usage: data.usage });

    const blocks: any[] = data.content || [];
    text = blocks.filter(b => b.type === "text").map(b => b.text).join("").trim();
    const calls = blocks.filter(b => b.type === "tool_use");
    if (data.stop_reason !== "tool_use" || !calls.length || round === MAX_TOOL_ROUNDS) break;

    messages.push({ role: "assistant", content: blocks });
    const results: any[] = [];
    for (const call of calls) {
      toolsUsed.push(call.name);
      let out: any;
      try {
        // eslint-disable-next-line no-await-in-loop
        out = await runTool(call.name, call.input, ctx);
      } catch (err) {
        logger.warn(`AI tool ${call.name} failed: ${err}`);
        out = { erro: "Não foi possível consultar agora." };
      }
      results.push({ type: "tool_result", tool_use_id: call.id, content: JSON.stringify(out) });
    }
    messages.push({ role: "user", content: results });
  }

  return { text, handoff: text.includes(HANDOFF_MARKER), tools: toolsUsed, collected, tokens };
};

// ---------------------------------------------------------------- live conversation

const loadHistory = async (ticket: Ticket, limit: number): Promise<ChatTurn[]> => {
  const rows = await Message.findAll({
    where: { ticketId: ticket.id, isDeleted: false, body: { [Op.ne]: "" } },
    order: [["createdAt", "DESC"]],
    limit
  });
  const turns: ChatTurn[] = [];
  for (const m of rows.reverse()) {
    const role = m.fromMe ? "assistant" : "user";
    const body = String(m.body).replace(/‎/g, "");
    const last = turns[turns.length - 1];
    if (last && last.role === role) last.content += `\n${body}`;
    else turns.push({ role, content: body });
  }
  while (turns.length && turns[0].role !== "user") turns.shift();
  return turns;
};

// every SUMMARY_EVERY answers, older context is squeezed into a few lines so the prompt stays short
const refreshSummary = async (agent: AiAgent, ticket: Ticket): Promise<void> => {
  try {
    const apiKey = await resolveKey(agent);
    if (!apiKey || agent.provider !== "anthropic") return;
    const history = await loadHistory(ticket, 24);
    if (history.length < 4) return;
    const transcript = history.map(t => `${t.role === "user" ? "Aluno" : "Atendente"}: ${t.content}`).join("\n").slice(0, 6000);
    const data = await callAnthropic(apiKey, {
      model: agent.model,
      max_tokens: 220,
      messages: [
        {
          role: "user",
          content: `Resuma em até 5 linhas, em português, o que o aluno quer e o que já foi combinado. Só fatos, sem enfeite.\n\n${transcript}`
        }
      ]
    });
    await logUsage({ agentId: agent.id, ticketId: ticket.id, model: agent.model, kind: "summary", usage: data.usage });
    const summary = (data.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("").trim();
    if (summary) await ticket.update({ aiSummary: summary });
  } catch (err) {
    logger.warn(`AI summary not updated: ${err}`);
  }
};

type Say = (ticket: Ticket, body: string) => Promise<void>;

const handoff = async (ticket: Ticket, agent: AiAgent, reason: HandoffReason, say: Say, silent = false) => {
  if (!silent) {
    await say(
      ticket,
      agent.handoffMessage || "Vou transferir você para um de nossos atendentes. Um momento, por favor."
    );
  }
  await handoffToHuman(ticket.id, agent, reason);
};

// Called once the person stopped writing (see RunInboundAutomation): answers the whole burst with one reply.
export const runAiForTicket = async (ticketId: number, say: Say): Promise<void> => {
  const ticket = await ShowTicketService(ticketId);
  if (!ticket.aiActive || ticket.userId || ticket.status === "closed") return;
  const agent = await findAgentForTicket(ticket);
  if (!agent) return;

  try {
    if (agent.dailyTokenCap > 0 && (await tokensToday(agent.id)) >= agent.dailyTokenCap) {
      await handoff(ticket, agent, "limite_tokens", say);
      return;
    }
    if ((ticket.aiTurns || 0) >= (agent.handoffAfterTurns || 14)) {
      await handoff(ticket, agent, "limite_turnos", say);
      return;
    }

    const history = await loadHistory(ticket, 30);
    const last = history[history.length - 1];
    // nothing new from the person since the last answer
    if (!last || last.role !== "user") return;

    // an FAQ with a ready answer needs no model at all
    const faq = await matchFaq(agent.id, last.content);
    if (faq) {
      await say(ticket, faq.content);
      await ticket.update({ aiTurns: (ticket.aiTurns || 0) + 1 });
      return;
    }

    const result = await respond(agent, {
      ticket,
      history,
      summary: ticket.aiSummary,
      collected: ticket.aiSlots
    });

    if (result.handoff) {
      await handoff(ticket, agent, "pedido", say);
      return;
    }
    if (result.text) await say(ticket, result.text);

    const turns = (ticket.aiTurns || 0) + 1;
    await ticket.update({ aiTurns: turns });
    const fresh = await Ticket.findByPk(ticket.id);

    // everything needed is known: the reply already told the student a consultant continues
    if (fresh && missingSlots(agent, fresh.aiSlots).length === 0 && Object.keys(fresh.aiSlots || {}).length) {
      await handoff(fresh, agent, "qualificado", say, true);
      return;
    }
    if (turns % SUMMARY_EVERY === 0 && fresh) await refreshSummary(agent, fresh);
  } catch (err) {
    const detail = err?.response?.data?.error?.message || err?.message || err;
    logger.error(`AI agent "${agent.name}" failed: ${detail}`);
    // never go silent: a person takes over
    await handoff(ticket, agent, "sem_resposta", say, true).catch(() => ticket.update({ aiActive: false }));
  }
};
