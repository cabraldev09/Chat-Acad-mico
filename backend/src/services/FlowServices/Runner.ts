import { Op } from "sequelize";

import AiAgent from "../../models/AiAgent";
import ChatFlow from "../../models/ChatFlow";
import ChatFlowRun from "../../models/ChatFlowRun";
import ChatFlowStat from "../../models/ChatFlowStat";
import Ticket from "../../models/Ticket";
import { logger } from "../../utils/logger";
import ShowTicketService from "../TicketServices/ShowTicketService";
import { Effects, RunState, StepResult, advance, firstNode, normalize, resume } from "./Engine";
import { ticketEffects } from "./Effects";
import { Graph, parseGraph } from "./Graph";

export interface FlowEntry {
  type: "first_message" | "keyword" | "any" | "manual";
  keywords?: string[];
}

export const parseEntry = (raw: any): FlowEntry => {
  try {
    const e = typeof raw === "string" ? JSON.parse(raw) : raw;
    return ["first_message", "keyword", "any", "manual"].includes(e?.type) ? { type: e.type, keywords: Array.isArray(e.keywords) ? e.keywords.map(String) : [] } : { type: "first_message" };
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
    resumeAt: step.status === "delayed" ? step.resumeAt : null
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

// a flow that ended hands the ticket back to the rest of the automation
const release = async (ticket: Ticket, step: StepResult): Promise<void> => {
  if (step.status === "done" || step.status === "handoff") await ticket.update({ chatbotNodeId: -1 });
};

const startRun = async (flow: ChatFlow, ticket: Ticket, fx?: Effects): Promise<void> => {
  const graph = parseGraph(flow.published);
  const start = firstNode(graph);
  if (!start) return;
  const run = await ChatFlowRun.create({ flowId: flow.id, ticketId: ticket.id, contactId: ticket.contactId, version: flow.version, status: "waiting", vars: "{}" } as any);
  // while the flow talks, the old menu of the chatbot stays out of it
  await ticket.update({ chatbotNodeId: -1 });
  const effects = fx || ticketEffects(ticket, flow.name);
  const step = await advance(graph, start.id, { nodeId: null, vars: {}, tries: 0 }, effects);
  await save(run, step);
  await record(flow, step, true, false);
  await release(ticket, step);
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
      const state = stateOf(active);
      const crmBefore = !!state.vars.__crm;
      const step = await resume(graph, state, body, ticketEffects(ticket, flow.name));
      await save(active, step);
      await record(flow, step, false, crmBefore);
      await release(ticket, step);
      return true;
    }

    const flows = await ChatFlow.findAll({
      where: { status: "published", whatsappId: { [Op.or]: [ticket.whatsappId, null] } } as any,
      order: [["id", "ASC"]]
    });
    if (!flows.length) return false;
    const ticketHadRuns = (await ChatFlowRun.count({ where: { ticketId: ticket.id } })) > 0;
    // a keyword beats the first-message flow
    const matching =
      flows.find(f => parseEntry(f.entry).type === "keyword" && entryMatches(parseEntry(f.entry), body, ticketHadRuns)) ||
      flows.find(f => ["first_message", "any"].includes(parseEntry(f.entry).type) && entryMatches(parseEntry(f.entry), body, ticketHadRuns));
    if (!matching) return false;
    await startRun(matching, ticket);
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
      const step = await resume(graph, state, "", ticketEffects(ticket, flow.name));
      // eslint-disable-next-line no-await-in-loop
      await save(run, step);
      // eslint-disable-next-line no-await-in-loop
      await record(flow, step, false, !!state.vars.__crm);
      // eslint-disable-next-line no-await-in-loop
      await release(ticket, step);
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
