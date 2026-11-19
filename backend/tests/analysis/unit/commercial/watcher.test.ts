import { beforeEach, describe, expect, it, vi } from "vitest";

// the database pieces the follow-up touches, in memory
const state: any = { ticket: null, lead: null, stageKey: "in_service", settings: {} as Record<string, string>, activities: [] as string[], moves: [] as string[] };
vi.mock("../../../../src/models/Ticket", () => ({ default: { findByPk: async () => state.ticket } }));
vi.mock("../../../../src/models/Lead", () => ({ default: { findOne: async () => state.lead, findByPk: async () => state.lead } }));
vi.mock("../../../../src/models/AiAgent", () => ({ default: { findByPk: async () => ({ id: 1 }), findOne: async () => ({ id: 1 }) } }));
vi.mock("../../../../src/models/Message", () => ({ default: { count: async () => 1, findAll: async () => [{ body: "Quero valores", fromMe: false }] } }));
vi.mock("../../../../src/helpers/AppSettings", () => ({ getSetting: async (k: string, f = "") => state.settings[k] ?? f, setSetting: async (k: string, v: string) => { state.settings[k] = v; } }));
vi.mock("../../../../src/helpers/AppTime", () => ({ getAppTz: () => "America/Porto_Velho" }));
vi.mock("../../../../src/utils/logger", () => ({ logger: { warn: vi.fn(), info: vi.fn() } }));
vi.mock("../../../../src/services/CrmServices/LeadCore", () => ({
  addActivity: async (_l: number, _u: any, _t: string, body: string) => { state.activities.push(body); },
  changeStage: async (_l: number, id: number) => { state.moves.push(String(id)); }
}));
const MAP: any = { new_lead: 1, contact_started: 2, in_service: 3, qualified: 4, waiting_transcript: 5, curricular_analysis: 6, analysis_done: 7, ready_for_proposal: 8, proposal: 9, enrollment_in_progress: 10, enrolled: 11, follow_up: 12, no_response: 13, human_service: 14, no_interest: 15 };
vi.mock("../../../../src/services/CommercialServices/Pipeline", async () => {
  const real = await vi.importActual<any>("../../../../src/services/CommercialServices/Pipeline");
  return { ...real, effectiveMap: async () => MAP, keyOfStage: () => state.stageKey };
});
const target = vi.fn();
vi.mock("../../../../src/services/CommercialServices/Rules", async () => {
  const real = await vi.importActual<any>("../../../../src/services/CommercialServices/Rules");
  return { ...real, targetStageKey: (...a: any[]) => target(...a), temperatureOf: () => "warm", nextActionOf: () => "present_course" };
});
vi.mock("../../../../src/services/CommercialServices/Process", () => ({ readConversation: async (_t: any, slots: any) => ({ slots, asked: new Set(), got: new Set(), proposalSent: false }) }));
vi.mock("../../../../src/services/CommercialServices/Slots", () => ({ loadState: async () => ({ slots: {}, readyForProposal: false, summary: null }), hydrate: async (s: any) => s, saveState: async (s: any) => { state.saved = s; } }));
vi.mock("../../../../src/services/CopilotServices/Settings", () => ({ configOf: async () => ({ agentId: null }) }));
const ask = vi.fn();
vi.mock("../../../../src/services/AiServices/RunAiAgent", () => ({ resolveKey: async () => "key", askOnce: (...a: any[]) => ask(...a) }));

import { parseSituation, watchTicket } from "../../../../src/services/CommercialServices/Watcher";

const ticket = (extra: any = {}) => ({ id: 7, contactId: 3, userId: 2, aiActive: false, isGroup: false, segment: "sales", update: vi.fn(), ...extra });

describe("acompanhamento automático do CRM", () => {
  beforeEach(() => {
    Object.assign(state, { ticket: ticket(), lead: { id: 5, stageId: 3, cpf: null, enrolledAt: null, lostAt: null }, stageKey: "in_service", settings: {}, activities: [], moves: [], saved: null });
    target.mockReset(); ask.mockReset();
  });

  it("move para a frente pelo que a conversa mostra, sem IA", async () => {
    target.mockReturnValue("qualified");
    const r = await watchTicket(7);
    expect(r).toEqual({ moved: "qualified", ai: false });
    expect(state.moves).toEqual(["4"]);
    expect(state.activities[0]).toContain("Acompanhamento automático moveu o lead para “Qualificado”");
    expect(ask).not.toHaveBeenCalled();
  });

  it("nunca volta etapa nem vai para Matriculado", async () => {
    state.stageKey = "analysis_done";
    target.mockReturnValue("qualified");
    expect((await watchTicket(7)).moved).toBeNull();
    target.mockReturnValue("enrolled");
    expect((await watchTicket(7)).moved).toBeNull();
    expect(state.moves).toEqual([]);
  });

  it("conversa com o agente de IA ou sem atendente fica de fora", async () => {
    state.ticket = ticket({ aiActive: true });
    expect(await watchTicket(7)).toEqual({ moved: null, ai: false });
    state.ticket = ticket({ userId: null });
    expect(await watchTicket(7)).toEqual({ moved: null, ai: false });
  });

  it("a IA registra a situação, o próximo passo e move pela etapa que indicar, contando no limite do dia", async () => {
    target.mockReturnValue(null);
    ask.mockResolvedValue({ text: '{"situacao":"Quer valores de Pedagogia","proximo_passo":"Gerar a proposta","temperatura":"quente","etapa":"pronto_para_proposta"}' });
    const r = await watchTicket(7, { forceAi: true });
    expect(r).toEqual({ moved: "ready_for_proposal", ai: true });
    expect(state.saved.summary).toBe("Quer valores de Pedagogia");
    expect(state.saved.temperature).toBe("hot");
    expect(state.activities.some((a: string) => a.startsWith("Situação: Quer valores de Pedagogia"))).toBe(true);
    expect(state.settings.crm_watch_used).toMatch(/:1$/);
  });

  it("limite do dia atingido: não chama a IA", async () => {
    target.mockReturnValue(null);
    state.settings.crm_watch = JSON.stringify({ dailyLimit: 1 });
    state.settings.crm_watch_used = `${new Date().toLocaleDateString("en-CA", { timeZone: "America/Porto_Velho" })}:1`;
    expect((await watchTicket(7, { forceAi: true })).ai).toBe(false);
    expect(ask).not.toHaveBeenCalled();
  });

  it("desligado: não faz nada", async () => {
    state.settings.crm_watch = JSON.stringify({ enabled: false });
    target.mockReturnValue("qualified");
    expect(await watchTicket(7)).toEqual({ moved: null, ai: false });
  });

  it("lê a resposta da IA mesmo com texto em volta, e ignora sem interesse", () => {
    expect(parseSituation('Aqui: {"situacao":"x","proximo_passo":"y","temperatura":"morno","etapa":"sem_interesse"} fim')).toEqual({ situacao: "x", proximo_passo: "y", temperatura: "warm", etapa: null });
    expect(parseSituation("sem json")).toBeNull();
  });
});
