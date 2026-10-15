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
import { Effects } from "./Engine";
import { FlowNode } from "./Graph";

// invisible mark: bot messages are told apart from the team's
const MARK = "‎";
// the legacy menu of the chatbot must not start once a flow has talked to the ticket
const FLOW_DONE = -1;

// the answers that fill a field of the lead (the other ones stay only inside the flow)
const LEAD_FIELDS = ["nome", "email", "cidade", "curso", "modalidade", "forma_ingresso", "semestre_transferencia"];

const firstName = (n: string): string => String(n || "").trim().split(/\s+/)[0] || "";

// Effects of a real conversation: it sends, saves and moves things in the CRM.
export const ticketEffects = (ticket: Ticket, flowName: string): Effects => {
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

  return {
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
          const poloId = d.poloId ? Number(d.poloId) : null;
          if (poloId) {
            await lead.update({ poloId });
            const salesQueue = await Queue.findOne({ where: { poloId, role: "comercial" } });
            if (salesQueue) await UpdateTicketService({ ticketData: { queueId: salesQueue.id }, ticketId: ticket.id });
          }
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
      if (d.to === "polo_sales" || d.to === "polo_tutoria") {
        const lead = await leadOf();
        const q = lead?.poloId ? await Queue.findOne({ where: { poloId: lead.poloId, role: d.to === "polo_sales" ? "comercial" : "tutoria" } }) : null;
        queueId = q ? q.id : null;
      }
      if (queueId) {
        await UpdateTicketService({ ticketData: { queueId }, ticketId: ticket.id });
        await AutoAssignTicket(await ShowTicketService(ticket.id));
      }
      void vars;
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
    }
  };
};

export interface SimSample {
  name?: string;
  channel?: string;
  hours?: string; // open | closed
  tags?: string[];
  lead?: Record<string, string>;
}

// Effects of the simulator: nothing leaves the system, everything is only written down.
export const simEffects = (sample: SimSample = {}): { fx: Effects; messages: string[]; actions: string[] } => {
  const messages: string[] = [];
  const actions: string[] = [];
  const name = sample.name || "Maria";
  const fx: Effects = {
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
    who() { return { name, first: firstName(name) }; }
  };
  return { fx, messages, actions };
};
