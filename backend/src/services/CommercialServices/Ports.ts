import AgentMetricEvent from "../../models/AgentMetricEvent";
import Lead from "../../models/Lead";
import LeadReminderLog from "../../models/LeadReminderLog";
import LeadStage from "../../models/LeadStage";
import LeadTask from "../../models/LeadTask";
import { logger } from "../../utils/logger";
import { syncNextFollowUp } from "../CrmServices/FollowUp";
import { addActivity, changeStage } from "../CrmServices/LeadCore";
import { OFFICIAL_ONLY, StageKey, STAGE_SPECS, effectiveMap, keyOfStage } from "./Pipeline";
import { CommercialState, mirror, saveState } from "./Slots";

// What the commercial rules need from the outside world. The real ports write to the CRM; the ports of the simulator only write
// down what would be done (the lead of the simulator does not exist), so a test shows the funnel moving without touching data.
export interface AuditLine {
  kind: "crm" | "task" | "note" | "event" | "state";
  text: string;
}

export interface CommercialPorts {
  state: CommercialState;
  // after how many answers a qualified lead goes to the consultant of the polo (Setting ai_qualified_replies; 0 = never by this rule)
  qualifyAfter?: number;
  stageKeyNow(): Promise<StageKey | null>;
  moveStage(key: StageKey, reason: string): Promise<boolean>;
  // the first message of the system to the person, and the person's message
  markContact(direction: "in" | "out"): Promise<void>;
  task(dedupeKey: string, title: string, dueAt: Date, type?: string): Promise<boolean>;
  note(text: string): Promise<boolean>;
  event(event: string, meta?: any, once?: boolean): Promise<void>;
  save(): Promise<void>;
  audit: AuditLine[];
  // the name of the column of a key (for the brief)
  stageName(key: string | null): Promise<string | null>;
}

const TASK_TYPE: Record<string, string> = { proposal: "proposta", transcript: "documentos", follow_up: "whatsapp", human: "ligar" };

// ---------------------------------------------------------------- the real ones
export const dbPorts = (lead: Lead, state: CommercialState, ctx: { agentId?: number | null; flowId?: number | null } = {}): CommercialPorts => {
  const audit: AuditLine[] = [];
  const names = async (): Promise<Map<number, string>> => new Map((await LeadStage.findAll({ attributes: ["id", "name"] })).map(s => [s.id, s.name]));
  return {
    state,
    audit,
    async stageKeyNow() {
      const fresh = await Lead.findByPk(lead.id, { attributes: ["id", "stageId"] });
      return keyOfStage(await effectiveMap(), fresh ? fresh.stageId : lead.stageId);
    },
    async moveStage(key, reason) {
      if (OFFICIAL_ONLY.includes(key)) {
        audit.push({ kind: "crm", text: `“${STAGE_SPECS[key].name}” só muda com a matrícula confirmada pelo sistema: o agente não move para lá.` });
        return false;
      }
      const id = ((await effectiveMap())[key] ?? null) as number | null;
      if (!id) {
        audit.push({ kind: "crm", text: `Sem coluna mapeada para “${STAGE_SPECS[key].name}”: o lead fica onde está.` });
        return false;
      }
      try {
        await changeStage(lead.id, id, null, key === "no_interest" ? { lostReason: "Sem interesse", lostNote: reason.slice(0, 300) } : {});
        await addActivity(lead.id, null, "system", `Agente de IA moveu o lead para “${STAGE_SPECS[key].name}”: ${reason}`);
        state.stageKey = key;
        audit.push({ kind: "crm", text: `Moveu para “${STAGE_SPECS[key].name}” (${reason})` });
        return true;
      } catch (err) {
        logger.warn(`Commercial move to ${key} failed: ${(err as Error).message}`);
        return false;
      }
    },
    async markContact(direction) {
      const now = new Date();
      if (direction === "out") {
        // the first message of the AI is the first contact (a reply of the system never started the SLA clock before)
        const [claimed] = await Lead.update({ firstContactAt: now, lastContactAt: now } as any, { where: { id: lead.id, firstContactAt: null } as any });
        if (claimed) await addActivity(lead.id, null, "whatsapp", "Primeiro contato realizado pelo agente de IA");
        else await Lead.update({ lastContactAt: now } as any, { where: { id: lead.id } });
      }
    },
    async task(dedupeKey, title, dueAt, type) {
      const key = `commercial:${dedupeKey}`;
      // one task per reason, never repeated (a lead that goes back and forth does not fill the list)
      if (await LeadReminderLog.findOne({ where: { leadId: lead.id, key } })) return false;
      const open = await LeadTask.findOne({ where: { leadId: lead.id, title, doneAt: null as any } });
      if (open) return false;
      await LeadReminderLog.create({ leadId: lead.id, key } as any);
      await LeadTask.create({ leadId: lead.id, userId: lead.ownerId || null, type: type || TASK_TYPE[dedupeKey.split(":")[0]] || "outro", title: title.slice(0, 160), dueAt } as any);
      await syncNextFollowUp(lead.id);
      audit.push({ kind: "task", text: `Criou a tarefa “${title}”` });
      return true;
    },
    async note(text) {
      await addActivity(lead.id, null, "note", text);
      audit.push({ kind: "note", text: "Registrou a nota do atendimento" });
      return true;
    },
    async event(event, meta, once = true) {
      try {
        if (once && (await AgentMetricEvent.findOne({ where: { leadId: lead.id, event, once: true } }))) return;
        await AgentMetricEvent.create({ leadId: lead.id, agentId: ctx.agentId || state.agentId || null, flowId: ctx.flowId || state.flowId || null, event, once, meta: meta ? JSON.stringify(meta).slice(0, 1000) : null } as any);
      } catch (err) {
        // the milestone was written at the same time by another turn (the unique index): nothing to do
      }
    },
    async save() {
      await saveState(state);
    },
    async stageName(key) {
      if (!key) return null;
      const id = (await effectiveMap())[key as StageKey];
      return id ? (await names()).get(id) || STAGE_SPECS[key as StageKey].name : STAGE_SPECS[key as StageKey]?.name || null;
    }
  };
};

// ---------------------------------------------------------------- the ones of the simulator
export interface SimWorld {
  state: CommercialState;
  stageKey: StageKey | null;
  tasks: string[];
  notes: number;
  events: string[];
}

export const simPorts = (world: SimWorld): CommercialPorts => {
  const audit: AuditLine[] = [];
  return {
    state: world.state,
    audit,
    async stageKeyNow() { return world.stageKey; },
    async moveStage(key, reason) {
      if (OFFICIAL_ONLY.includes(key)) {
        audit.push({ kind: "crm", text: `“${STAGE_SPECS[key].name}” só muda com a matrícula confirmada pelo sistema: o agente não move para lá.` });
        return false;
      }
      world.stageKey = key;
      world.state.stageKey = key;
      audit.push({ kind: "crm", text: `Moveria para “${STAGE_SPECS[key].name}” (${reason})` });
      return true;
    },
    async markContact(direction) { if (direction === "out" && !world.state.slots.lastOutboundAt) audit.push({ kind: "state", text: "Marcaria o primeiro contato" }); },
    async task(dedupeKey, title) {
      if (world.tasks.includes(dedupeKey)) return false;
      world.tasks.push(dedupeKey);
      audit.push({ kind: "task", text: `Criaria a tarefa “${title}”` });
      return true;
    },
    async note() { world.notes += 1; audit.push({ kind: "note", text: "Registraria a nota do atendimento" }); return true; },
    async event(event, _meta, once = true) {
      if (once && world.events.includes(event)) return;
      world.events.push(event);
      audit.push({ kind: "event", text: `Marco: ${event}` });
    },
    async save() { /* the state travels with the simulator */ },
    async stageName(key) { return key ? STAGE_SPECS[key as StageKey]?.name || key : null; }
  };
};

export { mirror };
