import axios from "axios";
import { Op } from "sequelize";

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
import { humanHasTicket } from "../../helpers/HumanOwnership";
import AiAgent from "../../models/AiAgent";
import { Effects, StageTurn, StageTurnArgs, matchPolo } from "./Engine";
import { FlowNode } from "./Graph";
import { cleanStage } from "./StageSpec";
import { stepsOf, takeSteps } from "./StepLock";
import { findAgentForTicket, loadHistory, respond } from "../AiServices/RunAiAgent";
import { signed, styleOf } from "../AiServices/Style";
import { configOf } from "../CommercialServices/Config";
import { HandoffReason, handoffToHuman } from "../AiServices/Handoff";
import { captureUnknown, notifyOwner } from "../AiServices/Learning";
import { matchFaq } from "../AiServices/Kb";
import { tokensToday } from "../AiServices/Usage";
import { saveBrief } from "../CommercialServices/Brief";
import { runCommercialBlock } from "../CommercialServices/Block";
import { blankState, hydrate, loadState, mirror } from "../CommercialServices/Slots";
import { dbPorts, simPorts, SimWorld } from "../CommercialServices/Ports";
import { commercialAiTurn } from "../CommercialServices/Turn";
import { HandoffWhy, RoutePreview, Team, WHY_OF_EXIT, WHY_TEXT, afterHandoffNotice, previewRoute, qualifiedText, routeToCommercial } from "../CommercialServices/Router";
import { burstOf, mediaOfMessages, textOfMessage } from "../AiServices/Media";
import { splitIntoBlocks } from "../CommercialServices/Blocks";
import Message from "../../models/Message";
import TicketEvent from "../../models/TicketEvent";
import AgentMetricEvent from "../../models/AgentMetricEvent";
import { transcribeAudio } from "../AiServices/Transcribe";
import emitTicketUpdate from "../TicketServices/EmitTicketUpdate";
import { syncHandoffTasks } from "../CrmServices/HandoffTasks";

// invisible mark: bot messages are told apart from the team's
const MARK = "‎";
// the legacy menu of the chatbot must not start once a flow has talked to the ticket
const FLOW_DONE = -1;
// messages of one conversation in an hour past which a person takes over
const MAX_PER_HOUR = 40;

// the answers that fill a field of the lead (the other ones stay only inside the flow)
const LEAD_FIELDS = ["nome", "email", "cidade", "curso", "modalidade", "forma_ingresso", "semestre_transferencia", "prazo_decisao", "motivacao", "turno"];

const firstName = (n: string): string => String(n || "").trim().split(/\s+/)[0] || "";

// what the AI is told when it has to open the conversation of a stage (nobody wrote yet)
const OPENING_HINT = "(A conversa desta etapa está começando. Cumprimente a pessoa em uma frase e comece pelo objetivo da etapa.)";
const DEFAULT_HANDOFF = "Vou transferir você para um de nossos atendentes. Um momento, por favor.";
const DEFAULT_UNKNOWN = "Ótima pergunta! Vou confirmar essa informação com a nossa equipe e já te respondo.";
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
  // the switches of the agent ("Como o agente fala"): the signature opens the answer and "one message" turns the bubbles off
  const withStyle = async (t: StageTurn, node: FlowNode): Promise<StageTurn> => {
    const agent = await agentFor(cleanStage(node.data).agentId);
    if (!agent) return t;
    return { ...t, text: signed(t.text, agent), single: !styleOf(agent).splitMessages };
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

  const turnOnce = async ({ node, vars, input, turns }: StageTurnArgs): Promise<StageTurn> => {
      const stage = cleanStage(node.data);
      const steps = takeSteps(vars, node.id);
      const agent = await agentFor(stage.agentId);
      // nobody to talk as: the team takes the conversation
      if (!agent) return { text: "", exit: "human" };
      // one person writing without stopping (a bot, a loop, spam) cannot spend the AI of everybody: past the limit a person takes over
      if (input !== null && (await Message.count({ where: { ticketId: ticket.id, fromMe: false, createdAt: { [Op.gte]: new Date(Date.now() - 3600000) } } as any })) >= MAX_PER_HOUR) {
        vars.__why = "loop";
        vars.__spoke = "human";
        return { text: agent.handoffMessage || DEFAULT_HANDOFF, exit: "human" };
      }
      // the commercial agent still answers what needs no model (the opening, a request for a person, a price) when the day's limit is reached
      const capped = agent.dailyTokenCap > 0 && (await tokensToday(agent.id)) >= agent.dailyTokenCap;
      if (capped && !stage.hooks.includes("commercial")) {
        vars.__why = "limit_tokens";
        vars.__spoke = "limit";
        return { text: agent.handoffMessage || DEFAULT_HANDOFF, exit: "limit" };
      }
      let history = await loadHistory(ticket, 30);
      if (input === null) history = [...history, { role: "user", content: OPENING_HINT }];
      else {
        // The person's newest message is answered unless an earlier turn already answered it. The row of our own reply is saved after the
        // channel confirms it, so the order of the rows cannot be trusted: the time of the newest message is what counts.
        const newest = await Message.findOne({ where: { ticketId: ticket.id, fromMe: false, isDeleted: false }, order: [["createdAt", "DESC"]] });
        if (!newest) return { text: "" };
        if (vars.__answeredAt && new Date(String(vars.__answeredAt)).getTime() >= new Date(newest.createdAt).getTime()) return { text: "" };
        if (!history.length || history[history.length - 1].role !== "user") history = [...history, { role: "user", content: textOfMessage(newest) || input }];
        vars.__answeredAt = new Date(newest.createdAt).toISOString();
      }
      const last = history[history.length - 1];
      // the commercial agent: the state of the lead, the rules and the funnel are code; the model only talks and understands
      if (stage.hooks.includes("commercial")) {
        const { lead, ports } = await commercialOf(node);
        // what the person sent as files: a PDF is the transcript, a voice note is written down (when the company turned it on) or asked in writing
        const burst = input === null ? [] : await burstOf(ticket.id);
        const media = mediaOfMessages(burst);
        let said = input === null ? null : last.content;
        let audioUnreadable = false;
        const audios = media.filter(m => m.kind === "audio").slice(0, 3);
        if (audios.length) {
          const heard: string[] = [];
          for (const a of audios) {
            // eslint-disable-next-line no-await-in-loop
            const t = await transcribeAudio(a.file, agent.id);
            if (t) heard.push(t);
          }
          if (heard.length === audios.length && said !== null) {
            let n = 0;
            said = said.replace(/\[áudio\]/g, () => `[áudio] “${heard[n++] || ""}”`);
            last.content = said;
          } else audioUnreadable = true;
        }
        const prior = history.filter(h => h.role === "user").slice(0, -1).slice(-4).map(h => h.content);
        const turn = await commercialAiTurn({ agent, stage, nodeId: node.id, flowId: flowCtx.flowId, ports, ticket, lead, history, input: said, sandbox: false, contactName: ticket.contact?.name, turns, media, priorUserTexts: prior, audioUnreadable, capped, ...steps });
        if (turn.why) vars.__why = turn.why;
        // what the person was told is not said again by the handoff of the exit
        if (turn.text && turn.exit) vars.__spoke = turn.exit;
        return { text: turn.text, exit: turn.exit, collected: turn.collected, why: turn.why, stepsDone: turn.stepsDone };
      }
      const lastText = last && last.role === "user" ? last.content : "";
      // an FAQ with a ready answer needs no model at all
      if (input !== null && stage.useKnowledge) {
        const faq = await matchFaq(agent.id, lastText);
        if (faq) return { text: faq.content };
      }
      const known: Record<string, string> = { ...(ticket.aiSlots || {}) };
      stage.fields.forEach(f => { if (vars[f.key]) known[f.key] = String(vars[f.key]); });
      const result = await respond(agent, { ticket, history, summary: ticket.aiSummary, collected: known, stage, flowId: flowCtx.flowId, nodeId: node.id, ...steps });
      let text = result.text;
      if (result.exit === "off") {
        if (agent.learnFromTeam !== false && lastText) await captureUnknown(agent, ticket, lastText, ticket.contact?.name);
        if (!text) text = (agent.persona && agent.persona.unknownMessage) || DEFAULT_UNKNOWN;
      }
      return { text, exit: result.exit || null, collected: result.collected, stepsDone: result.stepsDone };
    };

  // a person (or another automation) took the conversation, or it was closed, while the AI was thinking
  const humanTookOver = async (): Promise<boolean> => {
    const fresh = await Ticket.findByPk(ticket.id, { attributes: ["userId", "aiActive", "status"] });
    return !fresh || !!fresh.userId || fresh.status === "closed" || fresh.aiActive === false;
  };
  const isTransient = (err: any): boolean => {
    const status = Number(err?.response?.status || err?.statusCode || 0);
    return status === 429 || (status >= 500 && status < 600) || /timeout|ETIMEDOUT|ECONNRESET|ECONNABORTED|EAI_AGAIN|socket hang up/i.test(String(err?.code || err?.message || ""));
  };
  // the AI could not answer (twice): the lead is told a person continues, the team gets the conversation, the owner of the agent is told why
  const failTurn = async (vars: Record<string, any>, err: any): Promise<StageTurn> => {
    const status = Number(err?.response?.status || 0);
    const code = String(err?.message || "");
    const reason = /NO_API_KEY/.test(code) ? "a chave de API não está cadastrada" : status === 401 || status === 403 ? "o provedor recusou a chave de API" : status === 429 ? "o limite ou o saldo do provedor acabou" : status >= 500 ? "o provedor de IA está fora do ar" : "erro técnico";
    logger.error(`AI turn failed (${reason}): ${code}`);
    const agent = await agentFor(null);
    await AgentMetricEvent.create({ leadId: null, agentId: agent ? agent.id : null, flowId: flowCtx.flowId || null, event: "agent_error", once: false, meta: JSON.stringify({ reason, status, code: code.slice(0, 200), ticketId: ticket.id }) } as any).catch(() => undefined);
    if (agent) await notifyOwner(agent, `⚠️ O agente *${agent.name}* não conseguiu responder uma conversa porque ${reason}. A conversa foi para a equipe.`).catch(() => undefined);
    vars.__why = "error";
    vars.__spoke = "human";
    return { text: (agent && agent.handoffMessage) || DEFAULT_HANDOFF, exit: "human" };
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

    // what the AI wrote goes out as short bubbles, one after the other (the sender shows "digitando…" and waits like a person)
    async sayBlocks(text) {
      for (const block of splitIntoBlocks(text)) await this.say(block);
    },

    async say(text, choices) {
      // a person took the conversation while the flow was thinking: nothing from the robot goes out after that
      if (await humanHasTicket(ticket.id)) return;
      const send = () => SendWhatsAppMessage({ body: `${MARK}${text}`, ticket, automated: true, choices: choices ? { ...choices, question: `${MARK}${choices.question}` } : undefined });
      try {
        await send();
      } catch (first) {
        // a connection that blinked: once more; if it still fails the team sees it in the conversation (the lead did not get this message)
        try {
          await new Promise(r => setTimeout(r, 1500));
          await send();
        } catch (err) {
          logger.error(`Flow could not send a message: ${err}`);
          await TicketEvent.create({ ticketId: ticket.id, type: "send_failed", actorId: null, note: `O agente de IA não conseguiu enviar uma mensagem: “${String(text).slice(0, 160)}”` } as any).catch(() => undefined);
        }
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
          if (ownerId) {
            const before = lead.ownerId;
            await lead.update({ ownerId });
            await syncHandoffTasks(lead.contactId, before).catch(() => undefined);
          }
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
      // a transfer is a handoff to people: from here the AI stays quiet in this conversation
      await ticket.update({ chatbotNodeId: FLOW_DONE, aiActive: false });
      // the commercial team of the polo: the Router finds the polo, the queue and the consultant (reserve queue and managers when needed),
      // warns them at once and writes down why
      // in an AI agent, tutoring and secretary go through the Router as well (the polo of the person, a queue with people, a warning)
      const team = d.to === "polo_tutoria" ? "tutoria" : d.to === "polo_coordenacao" ? "coordenacao" : "comercial";
      if (d.to === "polo_sales" || d.to === "chosen_polo_sales" || (flowCtx.agentId && (d.to === "polo_tutoria" || d.to === "polo_coordenacao"))) {
        const agent = await agentFor(null);
        const cfg = configOf(agent);
        // nothing was said about the handoff yet (a limit was reached, a plain transfer block): the lead hears it once; a qualified lead is
        // always told that the consultant of the polo continues (the agent's own answer was about the last question)
        if (vars.__why === "qualified") await this.say(await qualifiedText(ticket));
        else if (vars.__exit && vars.__spoke !== vars.__exit && !d.text) await this.say((agent && agent.handoffMessage) || DEFAULT_HANDOFF);
        const wanted = Number(((await leadOf()) ? (await loadState((await leadOf())!.id)).slots.preferredConsultantId : 0) || 0) || null;
        const routed = await routeToCommercial(ticket, { keepOwner: cfg.keepOwner, preferredUserId: wanted, team, why: vars.__why || WHY_OF_EXIT[String(vars.__exit || "")] || "other", poloId: d.to === "chosen_polo_sales" && vars.poloId ? Number(vars.poloId) : null, city: vars.city || vars.cidade || null, agentId: flowCtx.agentId || null });
        const notice = afterHandoffNotice(routed, cfg.messages);
        if (notice) await this.say(notice);
        return;
      }
      if (d.to === "user" && d.userId) {
        const user = await User.findByPk(Number(d.userId));
        if (user) await UpdateTicketService({ ticketData: { userId: user.id, status: "open" }, ticketId: ticket.id });
        return;
      }
      let queueId: number | null = d.to === "queue" ? Number(d.queueId) : null;
      if (d.to === "polo_sales" || d.to === "polo_tutoria" || d.to === "chosen_polo_sales" || d.to === "polo_coordenacao") {
        const lead = await leadOf();
        // "chosen": the polo the person picked inside the flow, else the one already on the lead
        const poloId = d.to === "chosen_polo_sales" && vars.poloId ? Number(vars.poloId) : lead?.poloId;
        const q = poloId ? await Queue.findOne({ where: { poloId, role: d.to === "polo_tutoria" ? "tutoria" : d.to === "polo_coordenacao" ? "coordenacao" : "comercial" } }) : null;
        queueId = q ? q.id : null;
      }
      if (queueId) {
        await UpdateTicketService({ ticketData: { queueId }, ticketId: ticket.id });
        await AutoAssignTicket(await ShowTicketService(ticket.id));
      }
    },

    async handToAi() {
      await ticket.update({ chatbotNodeId: FLOW_DONE, aiActive: true });
      await emitTicketUpdate(ticket.id);
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
        writeBrief: async brief => { await saveBrief(ticket.id, lead, state, brief); }
      });
      Object.assign(vars, out);
    },

    // The AI never leaves a person without an answer or a destination: a failure is tried once more, then the team takes the conversation
    // (with the reason), and the owner of the agent is told why. A person who took the conversation while the model was thinking is not
    // answered over.
    async aiTurn(args: StageTurnArgs): Promise<StageTurn> {
      // the message is marked as answered when the turn starts; a turn that failed has not answered it, so the retry must see it as new
      const answeredBefore = args.vars.__answeredAt;
      const attempt = async (): Promise<StageTurn> => {
        const t = await turnOnce(args);
        if ((t.text || t.exit) && (await humanTookOver())) return { text: "" };
        return t.text ? await withStyle(t, args.node) : t;
      };
      try {
        return await attempt();
      } catch (first) {
        let err: any = first;
        if (isTransient(first)) {
          if (answeredBefore === undefined) delete args.vars.__answeredAt;
          else args.vars.__answeredAt = answeredBefore;
          await new Promise(r => setTimeout(r, 1500));
          try {
            return await attempt();
          } catch (second) {
            err = second;
          }
        }
        return failTurn(args.vars, err);
      }
    },

    async humanHandoff(_node, exit, vars) {
      const agent = await agentFor(null);
      await ticket.update({ chatbotNodeId: FLOW_DONE });
      // the stage ended by another way out with steps of its checklist still pending: the team is told what was left
      if (vars?.__stepsMissing) {
        const lead = await Lead.findOne({ where: { contactId: ticket.contactId }, attributes: ["id"] });
        if (lead) await addActivity(lead.id, null, "system", `O agente encerrou a etapa sem cumprir: ${String(vars.__stepsMissing)}`.slice(0, 480)).catch(() => undefined);
      }
      // a stage that ended by itself already said goodbye; for the others the person is told a colleague continues
      if (agent && exit !== "off" && vars?.__spoke !== exit) await this.say(agent.handoffMessage || DEFAULT_HANDOFF);
      if (agent) {
        const routed = await handoffToHuman(ticket.id, agent, REASON_OF[exit] || "pedido", undefined, vars?.__why || WHY_OF_EXIT[exit] || "other");
        const notice = routed ? afterHandoffNotice(routed, configOf(agent).messages) : null;
        if (notice) await this.say(notice);
      } else {
        await ticket.update({ aiActive: false });
        const routed = await routeToCommercial(ticket, { why: vars?.__why || WHY_OF_EXIT[exit] || "other" });
        const notice = afterHandoffNotice(routed, null);
        if (notice) await this.say(notice);
      }
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
  // the checklist of the stage: how many steps it has and which are done
  steps?: { total: number; done: number[] };
}

export const simEffects = (sample: SimSample = {}, opts: { agent?: AiAgent | null; flowId?: number | null } = {}): { fx: Effects; messages: string[]; actions: string[]; traces: StageTrace[]; routes: RoutePreview[] } => {
  const messages: string[] = [];
  // who would take the conversation (real polos, queues and consultants; nothing is written and nobody is warned)
  const routes: RoutePreview[] = [];
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
    async sayBlocks(text) { splitIntoBlocks(text).forEach(b => messages.push(b)); },
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
    async transfer(node, vars) {
      const to = node.data?.to || "equipe";
      if (to === "polo_sales" || to === "chosen_polo_sales" || to === "polo_tutoria" || to === "polo_coordenacao") {
        // what the Router would do: the polo from the city, the commercial team of that polo, the reserve queue when it is unknown
        const world = vars.__commercial as SimWorld | undefined;
        const city = String((world && world.state.slots.city) || vars.city || (sample.lead || {}).cidade || "");
        // the agent is real: show who would take it, with the real polos, queues and consultants (nothing is written)
        if (opts.agent && to !== "chosen_polo_sales") {
          const cfg = configOf(opts.agent);
          const teamOf: Team = to === "polo_tutoria" ? "tutoria" : to === "polo_coordenacao" ? "coordenacao" : "comercial";
          routes.push(await previewRoute({ city, team: teamOf, keepOwner: cfg.keepOwner, hot: world ? world.state.temperature === "hot" : false, preferredUserId: world ? Number(world.state.slots.preferredConsultantId) || null : null, preferredName: world && world.state.slots.preferredConsultantName ? String(world.state.slots.preferredConsultantName) : null, messages: cfg.messages }));
        }
        const polos = await fx.listPolos();
        // the polo the person chose inside the flow wins over the one the city points to
        const chosen = to === "chosen_polo_sales" && vars.poloId ? polos.find(p => p.id === Number(vars.poloId)) : undefined;
        const found: { polo?: { id: number; name: string } } = chosen ? { polo: chosen } : city ? matchPolo(polos, city) : {};
        const why = WHY_TEXT[((vars.__why as HandoffWhy) || WHY_OF_EXIT[String(vars.__exit || "")] || "other") as HandoffWhy];
        const teamName = to === "polo_tutoria" ? "Tutoria" : to === "polo_coordenacao" ? "Secretaria" : "Comercial";
        actions.push(`Encaminha ao ${found.polo ? `${teamName} do polo ${found.polo.name}` : to === "polo_sales" || to === "chosen_polo_sales" ? "a fila de reserva (o polo ainda não foi identificado pela cidade)" : `${teamName} (o polo ainda não foi identificado pela cidade)`}: quem assume é avisado na hora. Motivo: ${why}.`);
        return;
      }
      actions.push(`Transfere a conversa (${to})`);
    },
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
    async aiTurn({ node, vars, input, turns }: StageTurnArgs): Promise<StageTurn> {
      const stage = cleanStage(node.data);
      const steps = takeSteps(vars, node.id);
      const agent = opts.agent || null;
      if (!agent) return { text: "(Simulação: nenhum agente de IA ativo para conversar. Em produção a conversa iria para a equipe.)", exit: "human" };
      const hist: Array<{ role: "user" | "assistant"; content: string }> = Array.isArray(vars.__hist) ? vars.__hist : [];
      if (input !== null && input !== "") hist.push({ role: "user", content: input });
      const history = input === null || !hist.length ? [...hist, { role: "user" as const, content: OPENING_HINT }] : hist;
      if (stage.hooks.includes("commercial")) {
        const world = worldOf(vars);
        const ports = simPorts(world);
        const before = { stage: world.stageKey, state: mirror(world.state) };
        const turn = await commercialAiTurn({ agent, stage, nodeId: node.id, flowId: opts.flowId, ports, ticket: null, lead: null, history, input: input === null || input === "" ? null : input, sandbox: true, contactName: name, turns, ...steps });
        if (turn.text) hist.push({ role: "assistant", content: turn.text });
        vars.__hist = hist.slice(-20);
        ports.audit.forEach(a => actions.push(a.text));
        traces.push({
          nodeId: node.id, tools: turn.trace.tools.map(t => t.name), collected: turn.collected || {}, exit: turn.exit || null, sources: turn.trace.knowledge, tokens: turn.trace.tokens,
          commercial: { ...turn.trace, before, after: { stage: world.stageKey, state: mirror(world.state) }, audit: ports.audit }
        });
        return { text: turn.text, exit: turn.exit || null, collected: turn.collected, why: turn.why, stepsDone: turn.stepsDone };
      }
      const known: Record<string, string> = {};
      stage.fields.forEach(f => { if (vars[f.key]) known[f.key] = String(vars[f.key]); });
      const result = await respond(agent, { ticket: null, history, collected: known, sandbox: true, stage, flowId: opts.flowId, nodeId: node.id, ...steps });
      let text = result.text;
      if (result.exit === "off" && !text) text = (agent.persona && agent.persona.unknownMessage) || DEFAULT_UNKNOWN;
      if (text) hist.push({ role: "assistant", content: text });
      vars.__hist = hist.slice(-20);
      traces.push({ nodeId: node.id, tools: result.tools, collected: result.collected, exit: result.exit || null, sources: result.sources, tokens: result.tokens, steps: { total: stepsOf(stage).length, done: result.stepsDone || [] } });
      // the AI already said where the person goes ("vou encaminhar para a tutoria"): the handoff does not say it again
      if (text && result.exit && !["off", "limit"].includes(result.exit)) vars.__spoke = result.exit;
      return { text, exit: result.exit || null, collected: result.collected, stepsDone: result.stepsDone };
    },
    async humanHandoff(_node, exit) { actions.push(`Transfere para ${exit === "tutoria" ? "a tutoria do polo" : exit === "secretaria" ? "a secretaria do polo" : "a equipe"} (${exit === "limit" ? "limite de turnos" : exit === "off" ? "fora do escopo" : exit === "tutoria" ? "precisa da tutoria" : exit === "secretaria" ? "precisa da secretaria" : "pediu uma pessoa"})`); },
    async startFlow(flowId) { actions.push(`Inicia o fluxo ${flowId}`); return true; }
  };
  return { fx, messages, actions, traces, routes };
};
