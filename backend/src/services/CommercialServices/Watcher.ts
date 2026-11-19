import Lead from "../../models/Lead";
import AiAgent from "../../models/AiAgent";
import Message from "../../models/Message";
import Ticket from "../../models/Ticket";
import { getSetting, setSetting } from "../../helpers/AppSettings";
import { getAppTz } from "../../helpers/AppTime";
import { logger } from "../../utils/logger";
import { addActivity, changeStage } from "../CrmServices/LeadCore";
import { effectiveMap, keyOfStage, OFFICIAL_ONLY, StageKey, STAGE_SPECS } from "./Pipeline";
import { readConversation } from "./Process";
import { canAutoMove, nextActionOf, targetStageKey, temperatureOf } from "./Rules";
import { hydrate, loadState, saveState } from "./Slots";

// While a person (not the AI agent) talks to a lead, the conversation is followed for them:
//  1) for free, by rules: what the conversation already shows (entry type, course, city, transcript, analysis...) moves the lead forward
//     in the CRM, never backwards and never to "Matriculado" or "Perdido";
//  2) with a cheap AI call, now and then (every few new messages, or when the talk goes quiet), within a daily limit: the situation of the
//     lead in one line, the next step and the temperature are written on the lead, and a forward stage it points to is applied the same way.
// It runs a moment after the conversation stops (one run per conversation), so a burst of messages costs one look.

export interface WatchConfig { enabled: boolean; useAi: boolean; dailyLimit: number; everyMessages: number }
const DEFAULTS: WatchConfig = { enabled: true, useAi: true, dailyLimit: 300, everyMessages: 8 };
// how long the conversation must stay quiet before a look (CRM_WATCH=off turns the automatic look off, as the end-to-end suite does:
// it counts every call to the AI, and the look would add calls of its own at random moments)
const QUIET_MS = Number(process.env.CRM_WATCH_QUIET_MS || 90 * 1000);

export const watchConfigOf = async (): Promise<WatchConfig> => {
  try { return { ...DEFAULTS, ...JSON.parse(await getSetting("crm_watch", "{}")) }; } catch (e) { return { ...DEFAULTS }; }
};
export const saveWatchConfig = async (patch: Partial<WatchConfig>): Promise<WatchConfig> => {
  const next = { ...(await watchConfigOf()), ...patch };
  next.dailyLimit = Math.max(0, Math.min(5000, Math.round(Number(next.dailyLimit) || 0)));
  next.everyMessages = Math.max(3, Math.min(50, Math.round(Number(next.everyMessages) || DEFAULTS.everyMessages)));
  await setSetting("crm_watch", JSON.stringify({ enabled: !!next.enabled, useAi: !!next.useAi, dailyLimit: next.dailyLimit, everyMessages: next.everyMessages }));
  return next;
};

const today = (): string => new Date().toLocaleDateString("en-CA", { timeZone: getAppTz() });
export const aiUsedToday = async (): Promise<number> => {
  const [day, n] = String(await getSetting("crm_watch_used", "")).split(":");
  return day === today() ? Number(n) || 0 : 0;
};
const countAiUse = async (): Promise<void> => setSetting("crm_watch_used", `${today()}:${(await aiUsedToday()) + 1}`);

// per conversation: the timer of the quiet moment and the messages since the last AI look (in memory: a restart only delays a look)
const timers = new Map<number, NodeJS.Timeout>();
const sinceAi = new Map<number, number>();

const SITUATION_SYSTEM = [
  "Você acompanha o atendimento comercial de uma faculdade EAD (matrícula de alunos).",
  "Leia a conversa e responda SÓ um JSON, sem texto fora dele:",
  '{"situacao": "uma linha com o ponto em que o lead está", "proximo_passo": "o que o consultor deve fazer agora", "temperatura": "frio|morno|quente",',
  ' "etapa": "em_atendimento|qualificado|aguardando_historico|analise_curricular|analise_concluida|pronto_para_proposta|retomar_contato|sem_interesse|nenhuma"}',
  "Use só fatos da conversa. Qualificado = já se sabe curso e forma de ingresso. Pronto para proposta = pediu valores ou quer se matricular."
].join("\n");
const ETAPA_TO_KEY: Record<string, StageKey | null> = {
  em_atendimento: "in_service", qualificado: "qualified", aguardando_historico: "waiting_transcript", analise_curricular: "curricular_analysis",
  analise_concluida: "analysis_done", pronto_para_proposta: "ready_for_proposal", retomar_contato: "follow_up", sem_interesse: null, nenhuma: null
};
const TEMP: Record<string, "cold" | "warm" | "hot"> = { frio: "cold", morno: "warm", quente: "hot" };

export const parseSituation = (text: string): { situacao: string; proximo_passo: string; temperatura: "cold" | "warm" | "hot" | null; etapa: StageKey | null } | null => {
  const raw = String(text || "").match(/\{[\s\S]*\}/);
  if (!raw) return null;
  try {
    const j = JSON.parse(raw[0]);
    return {
      situacao: String(j.situacao || "").trim().slice(0, 300),
      proximo_passo: String(j.proximo_passo || "").trim().slice(0, 200),
      temperatura: TEMP[String(j.temperatura || "").toLowerCase()] || null,
      etapa: ETAPA_TO_KEY[String(j.etapa || "").toLowerCase()] ?? null
    };
  } catch (e) {
    return null;
  }
};

const moveIfForward = async (lead: Lead, target: StageKey | null, why: string): Promise<StageKey | null> => {
  if (!target || OFFICIAL_ONLY.includes(target)) return null;
  const map = await effectiveMap();
  const fresh = await Lead.findByPk(lead.id, { attributes: ["id", "stageId"] });
  const current = keyOfStage(map, fresh ? fresh.stageId : lead.stageId);
  if (!canAutoMove(current, target)) return null;
  const id = map[target];
  if (!id) return null;
  await changeStage(lead.id, id, null, {});
  await addActivity(lead.id, null, "system", `Acompanhamento automático moveu o lead para “${STAGE_SPECS[target].name}”: ${why}`);
  return target;
};

const agentForWatch = async (): Promise<AiAgent | null> => {
  const { configOf } = await import("../CopilotServices/Settings");
  const copilot = await configOf().catch(() => null);
  if (copilot?.agentId) return AiAgent.findByPk(copilot.agentId);
  return AiAgent.findOne({ where: { active: true }, order: [["id", "ASC"]] });
};

// one look at a conversation (exported for the tests and for a manual run)
export const watchTicket = async (ticketId: number, opts: { forceAi?: boolean } = {}): Promise<{ moved: StageKey | null; ai: boolean }> => {
  const config = await watchConfigOf();
  if (!config.enabled) return { moved: null, ai: false };
  const ticket = await Ticket.findByPk(ticketId);
  if (!ticket || ticket.isGroup || !ticket.userId || ticket.aiActive) return { moved: null, ai: false };
  if (["onboarding", "support", "relationship"].includes(ticket.segment)) return { moved: null, ai: false };
  const lead = await Lead.findOne({ where: { contactId: ticket.contactId }, order: [["updatedAt", "DESC"]] });
  if (!lead || lead.enrolledAt || lead.lostAt) return { moved: null, ai: false };

  // 1) the rules
  const state = await hydrate(await loadState(lead.id), lead);
  const read = await readConversation(ticket, state.slots, lead.cpf || null);
  state.slots = read.slots;
  const replied = !!(await Message.count({ where: { ticketId: ticket.id, fromMe: false } as any }));
  state.temperature = temperatureOf(state.slots, state.readyForProposal);
  let moved = await moveIfForward(lead, targetStageKey(state, { replied } as any) as StageKey | null, "o que a conversa já mostra");
  if (moved) state.stageKey = moved;
  state.nextAction = nextActionOf(state, {});

  // 2) the cheap AI look
  let ai = false;
  const count = (sinceAi.get(ticket.id) || 0);
  if (config.useAi && (opts.forceAi || count >= config.everyMessages) && (config.dailyLimit === 0 || (await aiUsedToday()) < config.dailyLimit)) {
    const agent = await agentForWatch();
    const { askOnce, resolveKey } = await import("../AiServices/RunAiAgent");
    const apiKey = agent ? await resolveKey(agent).catch(() => "") : "";
    if (agent && apiKey) {
      const msgs = await Message.findAll({ where: { ticketId: ticket.id } as any, order: [["createdAt", "DESC"]], limit: 20, attributes: ["body", "fromMe"] });
      const transcript = msgs.reverse().map(m => `${m.fromMe ? "Consultor" : "Lead"}: ${String(m.body || "").slice(0, 400)}`).join("\n");
      try {
        await countAiUse();
        const out = await askOnce(agent, apiKey, SITUATION_SYSTEM, transcript, 250, { ticketId: ticket.id, kind: "summary" });
        const s = parseSituation(out.text);
        if (s) {
          ai = true;
          sinceAi.set(ticket.id, 0);
          if (s.temperatura) state.temperature = s.temperatura;
          if (s.proximo_passo) state.nextAction = s.proximo_passo;
          if (s.situacao && s.situacao !== state.summary) {
            state.summary = s.situacao;
            await ticket.update({ aiSummary: s.situacao } as any);
            await addActivity(lead.id, null, "system", `Situação: ${s.situacao}${s.proximo_passo ? ` · Próximo passo: ${s.proximo_passo}` : ""}`);
          }
          const byAi = await moveIfForward(lead, s.etapa, s.situacao || "andamento da conversa");
          if (byAi) { moved = byAi; state.stageKey = byAi; }
        }
      } catch (err) {
        logger.warn(`Acompanhamento do ticket ${ticket.id}: IA não respondeu (${(err as Error).message})`);
      }
    }
  }
  await saveState(state);
  return { moved, ai };
};

// called for every message of a conversation: one look a moment after it goes quiet
export const noteConversationMessage = (ticketId: number): void => {
  if (process.env.CRM_WATCH === "off") return;
  sinceAi.set(ticketId, (sinceAi.get(ticketId) || 0) + 1);
  const previous = timers.get(ticketId);
  if (previous) clearTimeout(previous);
  timers.set(ticketId, setTimeout(() => {
    timers.delete(ticketId);
    watchTicket(ticketId).catch(err => logger.warn(`Acompanhamento do ticket ${ticketId} falhou: ${(err as Error).message}`));
  }, QUIET_MS));
};
