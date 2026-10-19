import axios from "axios";

import { isUrlSafe, safeRequest } from "../../helpers/SafeUrl";
import Contact from "../../models/Contact";
import Course from "../../models/Course";
import Lead from "../../models/Lead";
import LeadStage from "../../models/LeadStage";
import LeadTag from "../../models/LeadTag";
import LeadTask from "../../models/LeadTask";
import Polo from "../../models/Polo";
import Queue from "../../models/Queue";
import Tag from "../../models/Tag";
import Ticket from "../../models/Ticket";
import User from "../../models/User";
import { logger } from "../../utils/logger";
import { applyToLead } from "../AiServices/Tools";
import AutoAssignTicket from "../AutomationServices/AutoAssignTicket";
import { isWithinBusinessHours } from "../AutomationServices/BusinessHours";
import { addActivity, changeStage, pickOwner, upsertLead } from "../CrmServices/LeadCore";
import ShowTicketService from "../TicketServices/ShowTicketService";
import UpdateTicketService from "../TicketServices/UpdateTicketService";
import SendWhatsAppMessage from "../WbotServices/SendWhatsAppMessage";
import AiAgent from "../../models/AiAgent";
import { Effects, StageTurn, StageTurnArgs } from "./Engine";
import { FlowNode } from "./Graph";
import { cleanStage } from "./StageSpec";
import { findAgentForTicket, loadHistory, respond } from "../AiServices/RunAiAgent";
import { HandoffReason, handoffToHuman } from "../AiServices/Handoff";
import { captureUnknown } from "../AiServices/Learning";
import { matchFaq } from "../AiServices/Kb";
import { tokensToday } from "../AiServices/Usage";
import TicketEvent from "../../models/TicketEvent";
import { runCommercialBlock } from "../CommercialServices/Block";
import { blankState, hydrate, loadState, mirror } from "../CommercialServices/Slots";
import { dbPorts, simPorts, SimWorld } from "../CommercialServices/Ports";
import { commercialAiTurn } from "../CommercialServices/Turn";

// invisible mark: bot messages are told apart from the team's
const MARK = "‎";
// the legacy menu of the chatbot must not start once a flow has talked to the ticket
const FLOW_DONE = -1;

// the answers that fill a field of the lead (the other ones stay only inside the flow)
const LEAD_FIELDS = ["nome", "email", "cidade", "curso", "modalidade", "forma_ingresso", "semestre_transferencia", "prazo_decisao", "motivacao", "turno"];

const firstName = (n: string): string => String(n || "").trim().split(/\s+/)[0] || "";

// what the AI is told when it has to open the conversation of a stage (nobody wrote yet)
const OPENING_HINT = "(A conversa desta etapa está começando. Cumprimente a pessoa em uma frase e comece pelo objetivo da etapa.)";
const DEFAULT_HANDOFF = "Vou transferir você para um de nossos atendentes. Um momento, por favor.";
const DEFAULT_UNKNOWN = "Ótima pergunta! Vou confirmar essa informação com a nossa equipe e já te respondo. 🙂";
const REASON_OF: Record<string, HandoffReason> = { human: "pedido", off: "desconhecido", limit: "limite_turnos" };

export interface FlowContext {
  flowId?: number;
  // the AI agent of the flow (kind "agent")
  agentId?: number | null;
}

// Effects of a real conversation: it sends, saves and moves things in the CRM.
export const ticketEffects = (ticket: Ticket, flowName: string, flowCtx: FlowContext = {}): Effects => {
  // the lead (created when it does not exist yet) and its commercial state, with what the CRM already knows
  const commercialOf = async (node: FlowNode) => {
    const lead = await ensureLead({}, node);
    const state = await hydrate(await loadState(lead.id), lead);
    state.agentId = flowCtx.agentId || null;
    state.flowId = flowCtx.flowId || null;
    return { lead, state, ports: dbPorts(lead, state, { agentId: state.agentId, flowId: state.flowId }) };
  };
  // the agent a stage talks as: the one of the block, else the one of the flow, else the one that would answer this conversation
  const agentFor = async (stageAgentId?: number | null): Promise<AiAgent | null> => {
    const id = stageAgentId || flowCtx.agentId;
    const own = id ? await AiAgent.findByPk(id) : null;
    return own && own.active !== false ? own : findAgentForTicket(ticket);
  };
  const leadOf = async (): Promise<Lead | null> => Lead.findOne({ where: { contactId: ticket.contactId } });
  const collectedOf = (vars: Record<string, any>) => LEAD_FIELDS.filter(k => vars[k]).reduce((o: Record<string, string>, k) => ({ ...o, [k]: String(vars[k]) }), {});

  const ensureLead = async (vars: Record<string, any>, node: FlowNode): Promise<Lead> => {
    const existing = await leadOf();
    if (existing) return existing;
    const contact = await Contact.findByPk(ticket.contactId);
    const out = await upsertLead(
      { name: vars.nome || contact?.name, phone: contact?.number, contactId: ticket.contactId, source: node.data?.source || "Chatbot", channel: ticket.whatsapp?.channel },
      null
    );
    return out.lead;
  };

  // the lead takes the polo and the conversation goes to the sales queue of that polo
  const choosePolo = async (lead: Lead, poloId: number): Promise<string> => {
    const polo = await Polo.findByPk(poloId);
    if (!polo) return "";
    await lead.update({ poloId });
    const salesQueue = await Queue.findOne({ where: { poloId, role: "comercial" } });
    if (salesQueue) await UpdateTicketService({ ticketData: { queueId: salesQueue.id }, ticketId: ticket.id });
    return polo.name;
  };

  return {
    async listPolos() {
      const rows = await Polo.findAll({ where: { active: true }, order: [["name", "ASC"]], attributes: ["id", "name", "city"] });
      return rows.map(p => ({ id: p.id, name: p.name, city: p.city || "" }));
    },

    async setPolo(poloId) {
      const lead = await ensureLead({}, { id: "polo", type: "polo", data: { source: "Chatbot" } });
      const name = await choosePolo(lead, poloId);
      if (name) await addActivity(lead.id, null, "system", `Polo escolhido no fluxo “${flowName}”: ${name}`);
      return name;
    },

    async say(text, choices) {
      try {
        await SendWhatsAppMessage({ body: `${MARK}${text}`, ticket, automated: true, choices: choices ? { ...choices, question: `${MARK}${choices.question}` } : undefined });
      } catch (err) {
        logger.error(`Flow could not send a message: ${err}`);
      }
    },

    async readField(field) {
      if (field === "hours") return isWithinBusinessHours(await ticket.$get("whatsapp").then(w => w as any)) ? "open" : "closed";
      if (field === "channel") return ticket.whatsapp?.channel || "whatsapp";
      const lead = await leadOf();
      if (field === "tag") {
        if (!lead) return "";
        const links = await LeadTag.findAll({ where: { leadId: lead.id } });
        const tags = links.length ? await Tag.findAll({ where: { id: links.map(l => l.tagId) } }) : [];
        return tags.map(t => t.name).join(", ");
      }
      if (!lead) return "";
      switch (field) {
        case "lead.course": return lead.courseId ? (await Course.findByPk(lead.courseId))?.name || "" : "";
        case "lead.polo": return lead.poloId ? (await Polo.findByPk(lead.poloId))?.name || "" : "";
        case "lead.stage": return (await LeadStage.findByPk(lead.stageId))?.name || "";
        case "lead.source": return lead.source || "";
        case "lead.city": return lead.city || "";
        case "lead.modality": return lead.modality || "";
        default: return "";
      }
    },

    async saveField(field, value) {
      if (!LEAD_FIELDS.includes(field)) return;
      const collected = { ...(ticket.aiSlots || {}), [field]: value };
      await ticket.update({ aiSlots: collected });
      await applyToLead(ticket, collected);
    },

    async crm(node, vars) {
      const d = node.data || {};
      const lead = await ensureLead(vars, node);
      switch (d.action) {
        case "send_to_crm": {
          await applyToLead(ticket, collectedOf(vars));
          if (d.stageId) await changeStage(lead.id, Number(d.stageId), null).catch(err => logger.warn(`flow stage: ${err}`));
          if (d.tagId) await LeadTag.findOrCreate({ where: { leadId: lead.id, tagId: Number(d.tagId) }, defaults: { leadId: lead.id, tagId: Number(d.tagId) } as any });
          if (d.userId) await lead.update({ ownerId: Number(d.userId) });
          else if (d.ownerMode === "roundrobin" && !lead.ownerId) await lead.update({ ownerId: await pickOwner() });
          const summary = Object.entries(vars)
            .filter(([k, v]) => !k.startsWith("__") && v)
            .map(([k, v]) => `${k}: ${v}`)
            .join(" · ");
          await addActivity(lead.id, null, "system", `Enviado ao CRM pelo fluxo “${flowName}”${summary ? `. ${summary}` : ""}`);
          return String(lead.id);
        }
        case "move_stage":
          await changeStage(lead.id, Number(d.stageId), null).catch(err => logger.warn(`flow stage: ${err}`));
          return "";
        case "add_tag":
          await LeadTag.findOrCreate({ where: { leadId: lead.id, tagId: Number(d.tagId) }, defaults: { leadId: lead.id, tagId: Number(d.tagId) } as any });
          return "";
        case "remove_tag":
          await LeadTag.destroy({ where: { leadId: lead.id, tagId: Number(d.tagId) } });
          return "";
        case "set_owner": {
          const ownerId = d.userId ? Number(d.userId) : await pickOwner();
          if (ownerId) await lead.update({ ownerId });
          return "";
        }
        case "set_polo": {
          if (d.poloId) await choosePolo(lead, Number(d.poloId));
          return "";
        }
        case "create_task":
          await LeadTask.create({ leadId: lead.id, userId: lead.ownerId || null, type: "outro", title: String(d.title).slice(0, 160), dueAt: new Date(Date.now() + (Number(d.minutes) || 60) * 60000) } as any);
          return "";
        case "add_note":
          await addActivity(lead.id, null, "system", String(d.text).slice(0, 1000));
          return "";
        default:
          return "";
      }
    },

    async transfer(node, vars) {
      const d = node.data || {};
      await ticket.update({ chatbotNodeId: FLOW_DONE });
      if (d.to === "user" && d.userId) {
        const user = await User.findByPk(Number(d.userId));
        if (user) await UpdateTicketService({ ticketData: { userId: user.id, status: "open" }, ticketId: ticket.id });
        return;
      }
      let queueId: number | null = d.to === "queue" ? Number(d.queueId) : null;
      if (d.to === "polo_sales" || d.to === "polo_tutoria" || d.to === "chosen_polo_sales") {
        const lead = await leadOf();
        // "chosen": the polo the person picked inside the flow, else the one already on the lead
        const poloId = d.to === "chosen_polo_sales" && vars.poloId ? Number(vars.poloId) : lead?.poloId;
        const q = poloId ? await Queue.findOne({ where: { poloId, role: d.to === "polo_tutoria" ? "tutoria" : "comercial" } }) : null;
        queueId = q ? q.id : null;
      }
      if (queueId) {
        await UpdateTicketService({ ticketData: { queueId }, ticketId: ticket.id });
        await AutoAssignTicket(await ShowTicketService(ticket.id));
      }
    },

    async handToAi() {
      await ticket.update({ chatbotNodeId: FLOW_DONE, aiActive: true });
    },

    async close() {
      await ticket.update({ chatbotNodeId: FLOW_DONE });
      await UpdateTicketService({ ticketData: { status: "closed" }, ticketId: ticket.id });
    },

    async webhook(url, vars) {
      if (!(await isUrlSafe(url))) return false;
      try {
        await safeRequest({ url, method: "POST", data: { ticketId: ticket.id, contactId: ticket.contactId, flow: flowName, collected: Object.entries(vars).filter(([k]) => !k.startsWith("__")).reduce((o: Record<string, any>, [k, v]) => ({ ...o, [k]: v }), {}) }, timeout: 5000 });
        return true;
      } catch (err) {
        logger.warn(`flow webhook failed: ${err.message}`);
        return false;
      }
    },

    who() {
      const name = ticket.contact?.name || "";
      return { name, first: firstName(name) };
    },

    // a step of the commercial journey: the same rules as the turns of the AI, on the real lead
    async commercial(node, vars) {
      const { lead, state, ports } = await commercialOf(node);
      const out = await runCommercialBlock(node, {
        ports, ticketId: ticket.id, sandbox: false, academic: { ticket, dryRun: false, slots: mirror(state), patch: {}, cacheHits: 0, agentId: flowCtx.agentId || null },
        writeBrief: async brief => {
          await TicketEvent.create({ ticketId: ticket.id, type: "handoff", note: brief.slice(0, 4000) } as any);
          await addActivity(lead.id, null, "note", brief);
        }
      });
      Object.assign(vars, out);
    },

    async aiTurn({ node, vars, input }: StageTurnArgs): Promise<StageTurn> {
      const stage = cleanStage(node.data);
      const agent = await agentFor(stage.agentId);
      // nobody to talk as: the team takes the conversation
      if (!agent) return { text: "", exit: "human" };
      if (agent.dailyTokenCap > 0 && (await tokensToday(agent.id)) >= agent.dailyTokenCap) return { text: agent.handoffMessage || DEFAULT_HANDOFF, exit: "limit" };
      let history = await loadHistory(ticket, 30);
      const last = history[history.length - 1];
      if (input !== null && (!last || last.role !== "user")) return { text: "" };
      if (input === null) history = [...history, { role: "user", content: OPENING_HINT }];
      // the commercial agent: the state of the lead, the rules and the funnel are code; the model only talks and understands
      if (stage.hooks.includes("commercial")) {
        const { lead, ports } = await commercialOf(node);
        const turn = await commercialAiTurn({ agent, stage, nodeId: node.id, flowId: flowCtx.flowId, ports, ticket, lead, history, input: input === null ? null : last.content, sandbox: false, contactName: ticket.contact?.name });
        return { text: turn.text, exit: turn.exit, collected: turn.collected };
      }
      const lastText = last && last.role === "user" ? last.content : "";
      // an FAQ with a ready answer needs no model at all
      if (input !== null && stage.useKnowledge) {
        const faq = await matchFaq(agent.id, lastText);
        if (faq) return { text: faq.content };
      }
      const known: Record<string, string> = { ...(ticket.aiSlots || {}) };
      stage.fields.forEach(f => { if (vars[f.key]) known[f.key] = String(vars[f.key]); });
      const result = await respond(agent, { ticket, history, summary: ticket.aiSummary, collected: known, stage, flowId: flowCtx.flowId, nodeId: node.id });
      let text = result.text;
      if (result.exit === "off") {
        if (agent.learnFromTeam !== false && lastText) await captureUnknown(agent, ticket, lastText, ticket.contact?.name);
        if (!text) text = (agent.persona && agent.persona.unknownMessage) || DEFAULT_UNKNOWN;
      }
      return { text, exit: result.exit || null, collected: result.collected };
    },

    async humanHandoff(_node, exit) {
      const agent = await agentFor(null);
      await ticket.update({ chatbotNodeId: FLOW_DONE });
      // a stage that ended by itself already said goodbye; for the others the person is told a colleague continues
      if (agent && exit !== "off") await this.say(agent.handoffMessage || DEFAULT_HANDOFF);
      if (agent) await handoffToHuman(ticket.id, agent, REASON_OF[exit] || "pedido");
      else await ticket.update({ aiActive: false });
    },

    async startFlow(flowId) {
      const { startFlowForTicket } = await import("./Runner");
      return startFlowForTicket(flowId, ticket.id);
    }
  };
};

export interface SimSample {
  polos?: Array<{ id: number; name: string; city?: string }>;
  name?: string;
  channel?: string;
  hours?: string; // open | closed
  tags?: string[];
  lead?: Record<string, string>;
}

// Effects of the simulator: nothing leaves the system, everything is only written down.
export interface StageTrace {
  nodeId: string;
  // what the AI did in this turn: tools it used, fields it found, the exit it chose, the passages it read and what it cost
  tools: string[];
  collected: Record<string, string>;
  exit: string | null;
  sources: string[];
  tokens: { input: number; output: number; cacheRead: number };
  // the commercial agent: what the rules did in this turn (intent, slots, funnel before/after, tasks, notes, milestones)
  commercial?: any;
}

export const simEffects = (sample: SimSample = {}, opts: { agent?: AiAgent | null; flowId?: number | null } = {}): { fx: Effects; messages: string[]; actions: string[]; traces: StageTrace[] } => {
  const messages: string[] = [];
  const actions: string[] = [];
  const traces: StageTrace[] = [];
  const name = sample.name || "Maria";
  // the virtual lead of the simulator: its commercial state travels in the variables of the test, nothing is written
  const worldOf = (vars: Record<string, any>): SimWorld => {
    if (!vars.__commercial) {
      const state = blankState(0);
      state.slots.leadName = name;
      state.slots.phone = "(simulado)";
      Object.entries(sample.lead || {}).forEach(([k, v]) => {
        const map: Record<string, string> = { nome: "leadName", cidade: "city", curso: "courseName", modalidade: "courseModality", email: "email" };
        if (v && map[k]) state.slots[map[k]] = v;
      });
      vars.__commercial = { state, stageKey: "new_lead", tasks: [], notes: 0, events: [] } as SimWorld;
    }
    return vars.__commercial as SimWorld;
  };
  const fx: Effects = {
    async listPolos() {
      return (sample.polos && sample.polos.length ? sample.polos : [{ id: 1, name: "Polo Porto Velho", city: "Porto Velho" }, { id: 2, name: "Polo Ji-Paraná", city: "Ji-Paraná" }, { id: 3, name: "Polo Vilhena", city: "Vilhena" }]).map(p => ({ id: p.id, name: p.name, city: p.city || "" }));
    },
    async setPolo(poloId) {
      const chosen = (await fx.listPolos()).find(p => p.id === poloId);
      sample.lead = { ...(sample.lead || {}), polo: chosen ? chosen.name : "" };
      actions.push(`Define o polo: ${chosen ? chosen.name : poloId}`);
      return chosen ? chosen.name : "";
    },
    async say(text) { messages.push(text); },
    async readField(field) {
      if (field === "hours") return sample.hours || "open";
      if (field === "channel") return sample.channel || "whatsapp";
      if (field === "tag") return (sample.tags || []).join(", ");
      return (sample.lead || {})[field.replace(/^lead\./, "")] || "";
    },
    async saveField(field, value) { if (LEAD_FIELDS.includes(field)) actions.push(`Guarda no cadastro: ${field} = ${value}`); },
    async crm(node) {
      const d = node.data || {};
      const text: Record<string, string> = {
        send_to_crm: "Envia a conversa ao CRM",
        move_stage: "Move o lead de etapa",
        add_tag: "Coloca uma etiqueta no lead",
        remove_tag: "Tira uma etiqueta do lead",
        set_owner: "Define o responsável",
        set_polo: "Define o polo",
        create_task: `Cria a tarefa “${d.title || ""}”`,
        add_note: "Registra uma nota no lead"
      };
      actions.push(text[d.action] || "Ação no CRM");
      return "simulado";
    },
    async transfer(node) { actions.push(`Transfere a conversa (${node.data?.to || "equipe"})`); },
    async handToAi() { actions.push("Passa a conversa para o agente de IA"); },
    async close() { actions.push("Finaliza a conversa"); },
    async webhook(url) { actions.push(`Chama o webhook ${url}`); return true; },
    who() { return { name, first: firstName(name) }; },
    async commercial(node, vars) {
      const world = worldOf(vars);
      const ports = simPorts(world);
      const before = world.stageKey;
      const out = await runCommercialBlock(node, {
        ports, ticketId: null, sandbox: true, academic: { ticket: null, dryRun: true, slots: mirror(world.state), patch: {}, cacheHits: 0, agentId: opts.agent?.id || null },
        writeBrief: async brief => { actions.push(`Prepara o resumo para a equipe:\n${brief}`); }
      });
      Object.assign(vars, out);
      ports.audit.forEach(a => actions.push(a.text));
      traces.push({ nodeId: node.id, tools: [], collected: out, exit: null, sources: [], tokens: { input: 0, output: 0, cacheRead: 0 }, commercial: { block: node.data?.op || null, crm: { before, after: world.stageKey }, audit: ports.audit, state: mirror(world.state) } });
    },
    // the AI really answers (with the model of the agent), but nothing is sent or saved: the history lives in the state of the simulator
    async aiTurn({ node, vars, input }: StageTurnArgs): Promise<StageTurn> {
      const stage = cleanStage(node.data);
      const agent = opts.agent || null;
      if (!agent) return { text: "(Simulação: nenhum agente de IA ativo para conversar. Em produção a conversa iria para a equipe.)", exit: "human" };
      const hist: Array<{ role: "user" | "assistant"; content: string }> = Array.isArray(vars.__hist) ? vars.__hist : [];
      if (input !== null && input !== "") hist.push({ role: "user", content: input });
      const history = input === null || !hist.length ? [...hist, { role: "user" as const, content: OPENING_HINT }] : hist;
      if (stage.hooks.includes("commercial")) {
        const world = worldOf(vars);
        const ports = simPorts(world);
        const before = { stage: world.stageKey, state: mirror(world.state) };
        const turn = await commercialAiTurn({ agent, stage, nodeId: node.id, flowId: opts.flowId, ports, ticket: null, lead: null, history, input: input === null || input === "" ? null : input, sandbox: true, contactName: name });
        if (turn.text) hist.push({ role: "assistant", content: turn.text });
        vars.__hist = hist.slice(-20);
        ports.audit.forEach(a => actions.push(a.text));
        traces.push({
          nodeId: node.id, tools: turn.trace.tools.map(t => t.name), collected: turn.collected || {}, exit: turn.exit || null, sources: turn.trace.knowledge, tokens: turn.trace.tokens,
          commercial: { ...turn.trace, before, after: { stage: world.stageKey, state: mirror(world.state) }, audit: ports.audit }
        });
        return { text: turn.text, exit: turn.exit || null, collected: turn.collected };
      }
      const known: Record<string, string> = {};
      stage.fields.forEach(f => { if (vars[f.key]) known[f.key] = String(vars[f.key]); });
      const result = await respond(agent, { ticket: null, history, collected: known, sandbox: true, stage, flowId: opts.flowId, nodeId: node.id });
      let text = result.text;
      if (result.exit === "off" && !text) text = (agent.persona && agent.persona.unknownMessage) || DEFAULT_UNKNOWN;
      if (text) hist.push({ role: "assistant", content: text });
      vars.__hist = hist.slice(-20);
      traces.push({ nodeId: node.id, tools: result.tools, collected: result.collected, exit: result.exit || null, sources: result.sources, tokens: result.tokens });
      return { text, exit: result.exit || null, collected: result.collected };
    },
    async humanHandoff(_node, exit) { actions.push(`Transfere para a equipe (${exit === "limit" ? "limite de turnos" : exit === "off" ? "fora do escopo" : "pediu uma pessoa"})`); },
    async startFlow(flowId) { actions.push(`Inicia o fluxo ${flowId}`); return true; }
  };
  return { fx, messages, actions, traces };
};
