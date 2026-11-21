import { describe, expect, it } from "vitest";
import { buildPoloSupervisorInput, parsePoloSupervisorAnswer, poloSupervisorEvidence } from "../../src/services/AiServices/PoloSupervisor";

const metric = (poloId: number, attendances: number, extra: any = {}) => ({
  poloId,
  polo: `Polo ${poloId}`,
  attendances,
  receivedMessages: 10,
  sentMessages: 8,
  openNow: 1,
  waitingNow: 0,
  unansweredNow: 0,
  enrollments: 2,
  replies: { count: 6, medianMinutes: 3, p90Minutes: 8, withinSlaPct: 90 },
  ...extra
});

describe("feedback gerencial agregado por polo", () => {
  it("deriva a evidência somente dos números-base e ignora texto gerado pelo modelo", () => {
    expect(poloSupervisorEvidence(metric(2, 5) as any)).toBe("5 atendimentos; 10 mensagens recebidas; 8 enviadas; 0 sem resposta; 2 matrículas; resposta mediana 3 min, P90 8 min; 90% dentro do SLA.");
    expect(poloSupervisorEvidence(metric(2, 5, { replies: { count: 0, medianMinutes: null, p90Minutes: null, withinSlaPct: null } }) as any)).toContain("resposta mediana não disponível, P90 não disponível; não disponível dentro do SLA.");
  });

  it("só envia métricas de polos com pelo menos cinco atendimentos e não envia nomes", () => {
    const input = buildPoloSupervisorInput([metric(1, 4), metric(2, 5)] as any);
    expect(input.eligible).toHaveLength(1);
    expect(input.eligible[0]).toEqual({
      poloId: 2,
      attendances: 5,
      receivedMessages: 10,
      sentMessages: 8,
      openNow: 1,
      waitingNow: 0,
      unansweredNow: 0,
      enrollments: 2,
      replies: { count: 6, medianMinutes: 3, p90Minutes: 8, withinSlaPct: 90 }
    });
    expect(JSON.stringify(input)).not.toContain("Polo 2");
  });

  it("valida JSON e aceita somente uma resposta curta por polo elegível", () => {
    const valid = '{"summary":"Indicadores estáveis.","strengths":[],"risks":[{"poloId":2,"issue":"Fila aberta","action":"Acompanhar amanhã"}],"nextActions":[],"caveats":[]}';
    expect(parsePoloSupervisorAnswer(valid, [2])).toEqual({
      summary: "Indicadores estáveis.",
      strengths: [],
      risks: [{ poloId: 2, issue: "Fila aberta", action: "Acompanhar amanhã" }],
      nextActions: [],
      caveats: []
    });
    expect(() => parsePoloSupervisorAnswer("não é JSON", [2])).toThrow("ERR_AI_BAD_ANSWER");
    expect(() => parsePoloSupervisorAnswer('{"summary":"Ok","strengths":[],"risks":[{"poloId":99,"issue":"x","evidence":"y","action":"z"}],"nextActions":[],"caveats":[]}', [2])).toThrow("ERR_AI_BAD_ANSWER");
    expect(() => parsePoloSupervisorAnswer('{"summary":"","strengths":[],"risks":[],"nextActions":[],"caveats":[]}', [2])).toThrow("ERR_AI_BAD_ANSWER");
  });
});
