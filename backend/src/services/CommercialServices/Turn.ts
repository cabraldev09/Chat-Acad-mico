import AgentTurnLog from "../../models/AgentTurnLog";
import AiAgent from "../../models/AiAgent";
import Lead from "../../models/Lead";
import Ticket from "../../models/Ticket";
import { applyToLead } from "../AiServices/Tools";
import { captureUnknown } from "../AiServices/Learning";
import { ChatTurn, respond } from "../AiServices/RunAiAgent";
import { StageData } from "../FlowServices/StageSpec";
import { StageTurn } from "../FlowServices/Engine";
import { commercialTurn, CommercialTrace } from "./Hook";
import { CommercialPorts } from "./Ports";
import { ENTRY_LABEL, fastIntent, isGreeting, openingText, stageFieldsDone, topicsOf } from "./Rules";
import { mirror } from "./Slots";

// One turn of the commercial agent, the same in the real conversation and in the simulator (only the ports and the history change):
//   1. what is obvious (a request for a person, a price) is answered by the system, without the model;
//   2. the rest goes to the model, once, with the little context it needs;
//   3. whatever the model understood goes through the rules (state, funnel, tasks, notes) and the exit of the stage is decided there.
export const FIXED = {
  human: "Claro! Vou chamar um consultor para continuar com você. Um momento, por favor.",
  proposal: "Perfeito. Vou encaminhar seu atendimento para o consultor verificar a melhor condição de bolsa disponível e montar sua proposta certinha.",
  unknown: "Essa informação eu prefiro confirmar para não te passar nada incorreto. Vou encaminhar para o consultor verificar certinho para você."
};

// the person is back after a while (the conversation did not stop an hour ago)
const returningSince = (iso: any): boolean => !!iso && Date.now() - new Date(String(iso)).getTime() > 6 * 3600000;

// a value in reais in the answer: the agent never gives one (it would be an invention, or a price from an old table)
export const leaksPrice = (text: string): boolean => /R\$\s*\d|\b\d[\d.,]*\s*(reais|conto)\b/i.test(text || "");

export interface TurnDeps {
  agent: AiAgent;
  stage: StageData;
  nodeId: string;
  flowId?: number | null;
  ports: CommercialPorts;
  ticket: Ticket | null;
  lead: Lead | null;
  // the conversation so far (the last message is the person's; at the opening it is a hint to speak first)
  history: ChatTurn[];
  // what the person wrote; null when the stage opens the conversation
  input: string | null;
  sandbox: boolean;
  contactName?: string | null;
  // how many turns this stage already had
  turns?: number;
}

export interface CommercialTurnResult extends StageTurn {
  trace: {
    userText: string;
    deterministic: boolean;
    intent: string | null;
    tools: Array<{ name: string; args: any; result: string }>;
    knowledge: string[];
    commercial: CommercialTrace;
    entry: string;
    llmCalls: number;
    cacheHits: number;
    tokens: { input: number; output: number; cacheRead: number };
    latencyMs: number;
  };
}

// the slots that changed, as flat text for the variables of the flow ({{courseName}}, a condition on var:entryType)
const flat = (changed: Record<string, [any, any]>): Record<string, string> => {
  const out: Record<string, string> = {};
  Object.entries(changed).forEach(([k, [, v]]) => { if (v !== null && v !== undefined && v !== "") out[k] = String(v); });
  return out;
};

export const commercialAiTurn = async (d: TurnDeps): Promise<CommercialTurnResult> => {
  const started = Date.now();
  const lastText = d.input === null ? "" : d.input;
  const state = d.ports.state;
  const base = { userText: lastText, tools: [] as any[], knowledge: [] as string[], llmCalls: 0, cacheHits: 0, tokens: { input: 0, output: 0, cacheRead: 0 } };

  const log = async (r: { intent: string | null; deterministic: boolean; llmCalls: number; toolCalls: number; cacheHits: number; tokens: { input: number; output: number; cacheRead: number }; outcome: string | null; latencyMs: number }) => {
    if (d.sandbox) return;
    await AgentTurnLog.create({
      agentId: d.agent.id, flowId: d.flowId || null, nodeId: d.nodeId, ticketId: d.ticket?.id || null, leadId: state.leadId || null, intent: r.intent, deterministic: r.deterministic,
      llmCalls: r.llmCalls, toolCalls: r.toolCalls, cacheHits: r.cacheHits, inputTokens: r.tokens.input, outputTokens: r.tokens.output, cacheReadTokens: r.tokens.cacheRead,
      latencyMs: r.latencyMs, outcome: r.outcome, model: d.agent.model
    } as any).catch(() => undefined);
  };

  // 0) the opening: a greeting (or nobody wrote yet) is answered by the system, with the next question, without the model
  const fresh = !state.slots.lastOutboundAt || returningSince(state.slots.lastOutboundAt);
  if (fresh && !d.turns && (d.input === null || isGreeting(lastText))) {
    const first = String(state.slots.leadName || d.contactName || "").trim().split(/\s+/)[0] || "";
    const text = openingText(state.slots, first, !!state.slots.lastOutboundAt);
    const hook = await commercialTurn(d.ports, { userText: lastText, intent: d.input === null ? null : "greeting", tools: [], hadText: true, replied: d.input !== null, firstContactSent: true, nodeId: d.nodeId });
    const latencyMs = Date.now() - started;
    await log({ intent: "greeting", deterministic: true, llmCalls: 0, toolCalls: 0, cacheHits: 0, tokens: base.tokens, outcome: null, latencyMs });
    if (d.lead && !d.sandbox) await syncLead(d, hook.trace.changed);
    return { text, exit: null, collected: flat(hook.trace.changed), trace: { ...base, deterministic: true, intent: "greeting", commercial: hook.trace, entry: ENTRY_LABEL[state.slots.entryType || "unknown"], latencyMs } };
  }

  // the transcript arrives (the text of a message with a file is its name): the stage that asked for it goes on without the model
  const sentFile = d.input !== null && /^\S+\.(pdf|jpe?g|png|webp|heic)$/i.test(lastText.trim());
  if (sentFile && (state.slots.entryType === "transfer" || state.slots.entryType === "second_degree") && d.stage.outcomes.some(o => o.id === "enviou_historico")) {
    const hook = await commercialTurn(d.ports, { userText: lastText, intent: "analysis", patch: { hasTranscript: true }, tools: [], hadText: true, replied: true, nodeId: d.nodeId });
    const latencyMs = Date.now() - started;
    await log({ intent: "analysis", deterministic: true, llmCalls: 0, toolCalls: 0, cacheHits: 0, tokens: base.tokens, outcome: "enviou_historico", latencyMs });
    return {
      text: "Recebi o seu histórico, obrigado! Vou iniciar a análise curricular para verificar quais disciplinas poderão ser aproveitadas.", exit: hook.exit || "enviou_historico",
      collected: flat(hook.trace.changed), trace: { ...base, deterministic: true, intent: "analysis", commercial: hook.trace, entry: ENTRY_LABEL[state.slots.entryType || "unknown"], latencyMs }
    };
  }

  // 1) the obvious: no model
  const fast = d.input === null ? null : fastIntent(lastText);
  if (fast) {
    const text = fast.intent === "human" ? d.agent.handoffMessage || FIXED.human : FIXED.proposal;
    const hook = await commercialTurn(d.ports, { userText: lastText, fast: fast.intent, tools: [], hadText: true, replied: true, nodeId: d.nodeId });
    const latencyMs = Date.now() - started;
    await log({ intent: fast.intent, deterministic: true, llmCalls: 0, toolCalls: 0, cacheHits: 0, tokens: base.tokens, outcome: hook.exit, latencyMs });
    if (d.lead && !d.sandbox) await syncLead(d, hook.trace.changed);
    return { text, exit: hook.exit, collected: flat(hook.trace.changed), trace: { ...base, deterministic: true, intent: fast.intent, commercial: hook.trace, entry: ENTRY_LABEL[state.slots.entryType || "unknown"], latencyMs } };
  }

  // 2) the model, once
  const result = await respond(d.agent, {
    ticket: d.ticket, history: d.history, summary: state.summary, collected: null, sandbox: d.sandbox, stage: d.stage, flowId: d.flowId, nodeId: d.nodeId,
    commercial: { slots: mirror(state) }, topics: topicsOf(lastText), leadId: state.leadId || null
  });
  const turn = result.turn || {};
  const intent = d.input === null ? null : String(turn.intent || "other");
  const unknownQuestion = turn.pergunta_sem_resposta ? String(turn.pergunta_sem_resposta) : intent === "unknown" ? lastText : null;

  // 3) what the model understood goes through the rules
  let text = result.text;
  const hook = await commercialTurn(d.ports, {
    userText: lastText, intent, patch: result.academicPatch, tools: result.tools, hadText: !!text, replied: d.input !== null,
    followUp: intent === "follow_up" ? { reason: turn.motivo_retorno || turn.duvida_principal || null, at: turn.retorno_em || null } : null,
    unknownQuestion, objection: turn.objecao || (intent === "objection" ? lastText : null), question: turn.duvida_principal || null, topics: result.topics,
    firstContactSent: d.input === null && !!text, nodeId: d.nodeId
  });

  // what the person reads is also decided by the rules
  if (hook.exit === "human") text = d.agent.handoffMessage || FIXED.human;
  else if (hook.exit === "proposta" || leaksPrice(text)) {
    // a price was asked (the model did not notice) or the answer carries a value: the proposal is for a person
    text = FIXED.proposal;
    if (hook.exit !== "proposta") {
      const again = await commercialTurn(d.ports, { userText: lastText, fast: "price", tools: [], hadText: true, replied: true, nodeId: d.nodeId });
      hook.exit = again.exit;
      hook.trace = { ...hook.trace, ...again.trace, actions: [...hook.trace.actions, ...again.trace.actions] };
    }
  } else if (hook.exit === "off" && !text) text = FIXED.unknown;
  // no reason from the rules to leave: the stage ends by itself when what it asks for is known, or by the exit the model chose
  if (!hook.exit) {
    if (result.exit) hook.exit = result.exit;
    else if (stageFieldsDone(d.stage.fields, state.slots)) hook.exit = "done";
  }
  if (hook.exit === "off" && d.ticket && !d.sandbox && d.agent.learnFromTeam !== false && unknownQuestion) {
    await captureUnknown(d.agent, d.ticket, unknownQuestion, d.contactName || undefined).catch(() => undefined);
  }
  if (d.lead && !d.sandbox) await syncLead(d, hook.trace.changed);

  const latencyMs = Date.now() - started;
  await log({ intent, deterministic: false, llmCalls: result.rounds, toolCalls: result.tools.length, cacheHits: result.cacheHits, tokens: result.tokens, outcome: hook.exit, latencyMs });
  return {
    text,
    exit: hook.exit,
    collected: flat(hook.trace.changed),
    trace: {
      ...base, userText: lastText, deterministic: false, intent, tools: result.toolLog, knowledge: result.sources, commercial: hook.trace, entry: ENTRY_LABEL[state.slots.entryType || "unknown"],
      llmCalls: result.rounds, cacheHits: result.cacheHits, tokens: result.tokens, latencyMs
    }
  };
};

// what the conversation found out goes to the CRM fields that exist (only into empty fields: a person's data is not overwritten)
const syncLead = async (d: TurnDeps, changed: Record<string, [any, any]>): Promise<void> => {
  if (!d.ticket || !Object.keys(changed).length) return;
  const s = d.ports.state.slots;
  const c: Record<string, string> = {};
  if (changed.leadName && s.leadName) c.nome = String(s.leadName);
  if (changed.email && s.email) c.email = String(s.email);
  if (changed.city && s.city) c.cidade = String(s.city);
  if (changed.courseName && s.courseName) c.curso = String(s.courseName);
  if (changed.courseModality && s.courseModality) c.modalidade = String(s.courseModality);
  if (changed.entryType && s.entryType === "transfer") c.forma_ingresso = "Transferência externa";
  if (changed.entryType && s.entryType === "second_degree") c.forma_ingresso = "Portador de diploma (2ª graduação)";
  if (changed.semesterEntry && s.semesterEntry) c.semestre_transferencia = String(s.semesterEntry);
  if (Object.keys(c).length) await applyToLead(d.ticket, { ...(d.ticket.aiSlots || {}), ...c });
};
