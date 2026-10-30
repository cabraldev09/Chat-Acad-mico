import { robotMayTalk } from "../../helpers/AgentScope";
import { Op } from "sequelize";

import AiAgent from "../../models/AiAgent";
import ChatFlow from "../../models/ChatFlow";
import Message from "../../models/Message";
import ChatFlowRun from "../../models/ChatFlowRun";
import ChatFlowStat from "../../models/ChatFlowStat";
import Ticket from "../../models/Ticket";
import { logger } from "../../utils/logger";
import ShowTicketService from "../TicketServices/ShowTicketService";
import { Effects, RunState, StepResult, advance, firstNode, normalize, resume } from "./Engine";
import { FlowContext, ticketEffects } from "./Effects";
import { debounce } from "./Debounce";
import { claimAi, releaseAi } from "./Claim";
import { handoffToHuman } from "../AiServices/Handoff";
import { cleanStage } from "./StageSpec";
import { Graph, parseGraph } from "./Graph";
import emitTicketUpdate from "../TicketServices/EmitTicketUpdate";
import { noteAutomation } from "../AutomationServices/AutomationTrace";

export interface FlowEntry {
  type: "first_message" | "keyword" | "any" | "manual" | "agent";
  keywords?: string[];
}

export const parseEntry = (raw: any): FlowEntry => {
  try {
    const e = typeof raw === "string" ? JSON.parse(raw) : raw;
    return ["first_message", "keyword", "any", "manual", "agent"].includes(e?.type) ? { type: e.type, keywords: Array.isArray(e.keywords) ? e.keywords.map(String) : [] } : { type: "first_message" };
  } catch (err) {
    return { type: "first_message" };
  }
};

export const hasActiveAiAgent = async (): Promise<boolean> => (await AiAgent.count({ where: { active: true } as any })) > 0;

// counters shown over the blocks of the flow
const bump = async (flowId: number, nodeId: string): Promise<void> => {
  try {
    const [row] = await ChatFlowStat.findOrCreate({ where: { flowId, nodeId }, defaults: { flowId, nodeId, entered: 0 } as any });
    await row.increment("entered");
  } catch (err) {
    logger.warn(`flow stats: ${err}`);
  }
};

const record = async (flow: ChatFlow, step: StepResult, started: boolean, crmBefore: boolean): Promise<void> => {
  if (started) await bump(flow.id, "__start");
  for (const id of step.path) {
    // eslint-disable-next-line no-await-in-loop
    await bump(flow.id, id);
  }
  if (step.status === "done") await bump(flow.id, "__done");
  if (step.status === "handoff") await bump(flow.id, "__handoff");
  if (step.state.vars.__crm && !crmBefore) await bump(flow.id, "__crm");
};

const save = async (run: ChatFlowRun, step: StepResult): Promise<void> => {
  await run.update({
    nodeId: step.state.nodeId,
    vars: JSON.stringify(step.state.vars),
    tries: step.state.tries,
    status: step.status === "waiting" ? "waiting" : step.status === "delayed" ? "delayed" : step.status === "handoff" ? "handoff" : "done",
    // a message that arrived while the AI was thinking set the time of the next answer: saving the turn must not erase it
    ...(step.status === "waiting" ? {} : { resumeAt: step.status === "delayed" ? step.resumeAt : null })
  } as any);
};

const stateOf = (run: ChatFlowRun): RunState => {
  let vars = {};
  try {
    vars = JSON.parse(run.vars || "{}");
  } catch (e) {
    vars = {};
  }
  return { nodeId: run.nodeId, vars, tries: run.tries || 0 };
};

// a flow that ended hands the ticket back to the rest of the automation; an agent in blocks that ended does not start over at the
// next message (a person, or another automation, goes on)
const release = async (ticket: Ticket, step: StepResult, flow?: ChatFlow): Promise<void> => {
  if (step.status !== "done" && step.status !== "handoff") return;
  // an agent that handed over (or ended) stops answering; an "end" block marked "keep attending" leaves it on, so the person who comes
  // back tomorrow ("I'll think about it", "I'll send the transcript later") is attended again by a new run
  let keep = false;
  if (flow?.kind === "agent" && step.status === "done") {
    const last = parseGraph(flow.published).nodes.find(n => n.id === step.path[step.path.length - 1]);
    keep = !!last && last.type === "end" && last.data?.resume === true && !last.data?.close;
  }
  await ticket.update({ chatbotNodeId: -1, ...(flow?.kind === "agent" && !keep ? { aiActive: false } : {}) });
  // the agent left the conversation: the chat and the lists drop the "IA atendendo" mark
  if (flow?.kind === "agent" && !keep) await emitTicketUpdate(ticket.id);
};

// A run is being advanced (an AI turn can take seconds): a message that arrives meanwhile waits for it instead of touching a run that
// is not saved yet.
const inflight = new Set<number>();

const contextOf = (flow: ChatFlow): FlowContext => ({ flowId: flow.id, agentId: flow.agentId });

// how long to wait for more messages of the same burst before an AI stage answers (the setting of the agent that talks)
const waitOf = async (flow: ChatFlow, nodeId: string | null): Promise<number> => {
  const node = parseGraph(flow.published).nodes.find(n => n.id === nodeId);
  const id = (node ? cleanStage(node.data).agentId : null) || flow.agentId;
  const agent = id ? await AiAgent.findByPk(id) : null;
  return agent?.waitSeconds ?? 4;
};

const startRun = async (flow: ChatFlow, ticket: Ticket, fx?: Effects, pending?: string | null): Promise<void> => {
  const graph = parseGraph(flow.published);
  const start = firstNode(graph);
  if (!start) return;
  const run = await ChatFlowRun.create({ flowId: flow.id, ticketId: ticket.id, contactId: ticket.contactId, version: flow.version, status: "waiting", vars: "{}" } as any);
  // while the flow talks, the old menu of the chatbot stays out of it
  await ticket.update({ chatbotNodeId: -1 });
  const effects = fx || ticketEffects(ticket, flow.name, contextOf(flow));
  inflight.add(ticket.id);
  try {
    const step = await advance(graph, start.id, { nodeId: null, vars: {}, tries: 0, pending: pending ?? null }, effects);
    if (flow.kind !== "agent") {
      noteAutomation(ticket.id, `o fluxo "${flow.name}" (nº ${flow.id}, ${flow.whatsappId ? `da conexão ${flow.whatsappId}` : "de todas as conexões"}, entrada "${parseEntry(flow.entry).type}") começou e ${step.status === "done" ? "terminou" : step.status === "waiting" ? "ficou esperando a resposta da pessoa" : step.status === "handoff" ? "passou para a equipe" : "ficou em espera"} passando por ${step.path.length} bloco(s)`);
    }
    await save(run, step);
    await record(flow, step, true, false);
    await release(ticket, step, flow);
  } catch (err) {
    await failRun(run, ticket, flow, effects, err);
  } finally {
    inflight.delete(ticket.id);
  }
};

// Something broke while the flow was running (not the AI call, which has its own handling): the run ends, and an agent hands the
// conversation to the team instead of leaving the person without an answer and without a destination.
const failRun = async (run: ChatFlowRun, ticket: Ticket, flow: ChatFlow, effects: Effects, err: unknown): Promise<void> => {
  logger.error(`Flow ${flow.id} failed on ticket ${ticket.id}: ${err}`);
  noteAutomation(ticket.id, `o roteiro "${flow.name}" parou por um erro: ${(err as any)?.response?.data?.error?.message || (err as any)?.message || err}`);
  await run.update({ status: "done", resumeAt: null } as any).catch(() => undefined);
  if (flow.kind !== "agent" || !flow.agentId) return;
  const agent = await AiAgent.findByPk(flow.agentId);
  if (!agent) return;
  await effects.say(agent.handoffMessage || "Vou chamar um de nossos atendentes. Um momento, por favor.").catch(() => undefined);
  await handoffToHuman(ticket.id, agent, "sem_resposta", undefined, "error").catch(e => logger.error(`Handoff after failure failed: ${e}`));
};

const lastUserText = async (ticketId: number): Promise<string> => {
  const m = await Message.findOne({ where: { ticketId, fromMe: false, isDeleted: false }, order: [["createdAt", "DESC"]] });
  return String(m?.body || "").replace(/‎/g, "");
};

// The person stopped writing while an AI stage was waiting: the AI answers the whole burst once.
export const resumeStageRun = async (ticketId: number): Promise<void> => {
  const run = await ChatFlowRun.findOne({ where: { ticketId, status: "waiting" }, order: [["id", "DESC"]] });
  if (!run) return;
  const flow = await ChatFlow.findByPk(run.flowId);
  const ticket = await ShowTicketService(ticketId).catch(() => null);
  if (!flow || flow.status !== "published" || !ticket || ticket.status === "closed" || ticket.userId) {
    await run.update({ status: "done", resumeAt: null });
    return;
  }
  const graph = parseGraph(flow.published);
  // the run is still being advanced (its first answer is on the way): the burst is answered right after
  if (inflight.has(ticketId)) {
    debounce(`stage:${ticketId}`, 1, () => resumeStageRun(ticketId));
    return;
  }
  if (graph.nodes.find(n => n.id === run.nodeId)?.type !== "stage") return;
  // another server is answering this conversation: this burst is answered right after (the turn counts what was already answered)
  if (!(await claimAi(ticketId))) {
    debounce(`stage:${ticketId}`, 3, () => resumeStageRun(ticketId));
    return;
  }
  await run.update({ resumeAt: null } as any);
  const state = stateOf(run);
  const crmBefore = !!state.vars.__crm;
  inflight.add(ticketId);
  const effects = ticketEffects(ticket, flow.name, contextOf(flow));
  try {
    const step = await resume(graph, state, await lastUserText(ticketId), effects);
    await save(run, step);
    await record(flow, step, false, crmBefore);
    await release(ticket, step, flow);
  } catch (err) {
    await failRun(run, ticket, flow, effects, err);
  } finally {
    inflight.delete(ticketId);
    await releaseAi(ticketId);
  }
};

// a burst that was waiting when the server restarted (the timer is in memory, the deadline is in the database)
export const resumeStaleStageRuns = async (): Promise<void> => {
  const stale = await ChatFlowRun.findAll({ where: { status: "waiting", resumeAt: { [Op.lte]: new Date(Date.now() - 20000) } }, limit: 20 });
  for (const run of stale) {
    // eslint-disable-next-line no-await-in-loop
    await resumeStageRun(run.ticketId).catch(err => logger.error(`Stage resume failed: ${err}`));
  }
};

// The agent in blocks that talks for this conversation (an AI agent with a published graph), started once the person stopped writing.
export const runAgentGraph = async (ticket: Ticket, agent: AiAgent): Promise<boolean> => {
  const flow = await ChatFlow.findOne({ where: { kind: "agent", agentId: agent.id, status: "published" }, order: [["id", "DESC"]] });
  if (!flow) return false;
  debounce(`agent-start:${ticket.id}`, agent.waitSeconds ?? 4, async () => {
    const fresh = await ShowTicketService(ticket.id);
    if (!fresh.aiActive || fresh.userId || fresh.status === "closed" || !robotMayTalk(fresh)) {
      logger.info(`Agente ${agent.name} no ticket ${ticket.id}: não começou (aiActive ${fresh.aiActive}, atendente ${fresh.userId || "nenhum"}, status ${fresh.status})`);
      noteAutomation(ticket.id, `o agente "${agent.name}" não começou: a conversa já não está com o agente (aiActive ${fresh.aiActive ? "ligado" : "desligado"}, atendente ${fresh.userId || "nenhum"}, status ${fresh.status})`);
      return;
    }
    // already talking (a second burst before the first run was saved), here or in another server
    if (await ChatFlowRun.findOne({ where: { ticketId: fresh.id, status: { [Op.in]: ["waiting", "delayed"] } } })) {
      logger.info(`Agente ${agent.name} no ticket ${ticket.id}: já há uma conversa em andamento neste ticket`);
      noteAutomation(ticket.id, `o agente "${agent.name}" não começou de novo: já há uma conversa do roteiro em andamento nesta conversa`);
      return;
    }
    if (!(await claimAi(fresh.id))) {
      logger.info(`Agente ${agent.name} no ticket ${ticket.id}: outra instância já está respondendo`);
      return;
    }
    try {
      logger.info(`Agente ${agent.name} no ticket ${ticket.id}: começando o roteiro`);
      noteAutomation(ticket.id, `o agente "${agent.name}" começou o roteiro da conversa`);
      await startRun(flow, fresh, undefined, await lastUserText(fresh.id));
    } finally {
      await releaseAi(fresh.id);
    }
  });
  return true;
};

const entryMatches = (entry: FlowEntry, body: string, ticketHadRuns: boolean): boolean => {
  if (entry.type === "manual") return false;
  if (entry.type === "first_message") return !ticketHadRuns;
  if (entry.type === "any") return !ticketHadRuns;
  const text = normalize(body);
  return (entry.keywords || []).some(k => normalize(k) && text.includes(normalize(k)));
};

// Returns true when a flow took the message (the rest of the automation must stay quiet).
export const runFlowForTicket = async (ticket: Ticket, body: string): Promise<boolean> => {
  try {
    const active = await ChatFlowRun.findOne({ where: { ticketId: ticket.id, status: { [Op.in]: ["waiting", "delayed"] } }, order: [["id", "DESC"]] });
    if (active) {
      // the person writes while a delay counts time: nothing to answer yet
      if (active.status === "delayed") return true;
      const flow = await ChatFlow.findByPk(active.flowId);
      if (!flow || flow.status !== "published") {
        await active.update({ status: "done" });
        return false;
      }
      const graph = parseGraph(flow.published);
      noteAutomation(ticket.id, `o fluxo "${flow.name}" (nº ${flow.id}) já estava em andamento nesta conversa, esperando no bloco "${active.nodeId || "início"}", e recebeu a mensagem`);
      // an AI stage waits for the burst of messages to end, then answers once (a run still being advanced answers it right after)
      if (inflight.has(ticket.id) || graph.nodes.find(n => n.id === active.nodeId)?.type === "stage") {
        const wait = await waitOf(flow, active.nodeId);
        await active.update({ resumeAt: new Date(Date.now() + wait * 1000) } as any);
        debounce(`stage:${ticket.id}`, wait, () => resumeStageRun(ticket.id));
        return true;
      }
      const state = stateOf(active);
      const crmBefore = !!state.vars.__crm;
      const step = await resume(graph, state, body, ticketEffects(ticket, flow.name, contextOf(flow)));
      await save(active, step);
      await record(flow, step, false, crmBefore);
      await release(ticket, step, flow);
      return true;
    }

    const flows = await ChatFlow.findAll({
      // an agent in blocks is started by the AI step of the automation, never by the entry of a flow
      where: { status: "published", kind: { [Op.ne]: "agent" }, whatsappId: { [Op.or]: [ticket.whatsappId, null] } } as any,
      order: [["id", "ASC"]]
    });
    if (!flows.length) return false;
    const ticketHadRuns = (await ChatFlowRun.count({ where: { ticketId: ticket.id } })) > 0;
    // a keyword beats the first-message flow
    const matching =
      flows.find(f => parseEntry(f.entry).type === "keyword" && entryMatches(parseEntry(f.entry), body, ticketHadRuns)) ||
      flows.find(f => ["first_message", "any"].includes(parseEntry(f.entry).type) && entryMatches(parseEntry(f.entry), body, ticketHadRuns));
    if (!matching) return false;
    await startRun(matching, ticket, undefined, body);
    return true;
  } catch (err) {
    logger.error(`Flow run failed: ${err}`);
    return false;
  }
};

// start a flow for a ticket on purpose (a trigger, or the "test on my number" button)
export const startFlowForTicket = async (flowId: number, ticketId: number): Promise<boolean> => {
  const flow = await ChatFlow.findByPk(flowId);
  if (!flow || flow.status !== "published") return false;
  const ticket = await ShowTicketService(ticketId);
  if (ticket.isGroup) return false;
  await ChatFlowRun.update({ status: "done" }, { where: { ticketId, status: { [Op.in]: ["waiting", "delayed"] } } });
  await startRun(flow, ticket);
  return true;
};

// a "wait" block finished counting: the flow goes on (worker, every half minute)
export const resumeDelayedRuns = async (): Promise<void> => {
  const due = await ChatFlowRun.findAll({ where: { status: "delayed", resumeAt: { [Op.lte]: new Date() } }, limit: 30 });
  for (const run of due) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const flow = await ChatFlow.findByPk(run.flowId);
      // eslint-disable-next-line no-await-in-loop
      const ticket = run.ticketId ? await ShowTicketService(run.ticketId).catch(() => null) : null;
      if (!flow || flow.status !== "published" || !ticket || ticket.status === "closed") {
        // eslint-disable-next-line no-await-in-loop
        await run.update({ status: "done" });
        continue;
      }
      const graph: Graph = parseGraph(flow.published);
      const state = stateOf(run);
      // claim it first: two workers must not resume the same run
      // eslint-disable-next-line no-await-in-loop
      const [claimed] = await ChatFlowRun.update({ status: "waiting", resumeAt: null } as any, { where: { id: run.id, status: "delayed" } });
      if (!claimed) continue;
      // eslint-disable-next-line no-await-in-loop
      const step = await resume(graph, state, "", ticketEffects(ticket, flow.name, contextOf(flow)));
      // eslint-disable-next-line no-await-in-loop
      await save(run, step);
      // eslint-disable-next-line no-await-in-loop
      await record(flow, step, false, !!state.vars.__crm);
      // eslint-disable-next-line no-await-in-loop
      await release(ticket, step, flow);
    } catch (err) {
      logger.error(`Flow resume failed: ${err}`);
    }
  }
};

export const flowStats = async (flowId: number) => {
  const rows = await ChatFlowStat.findAll({ where: { flowId } });
  const nodes: Record<string, number> = {};
  rows.forEach(r => { nodes[r.nodeId] = r.entered; });
  const waiting = await ChatFlowRun.count({ where: { flowId, status: { [Op.in]: ["waiting", "delayed"] } } });
  return {
    nodes,
    started: nodes.__start || 0,
    done: nodes.__done || 0,
    handoff: nodes.__handoff || 0,
    crm: nodes.__crm || 0,
    waiting
  };
};
