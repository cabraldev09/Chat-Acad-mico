import { describe, expect, it } from "vitest";

import { IMPORT_SYSTEM, IMPROVE, parseEvaluation, parseImportAnswer } from "../../src/services/ReadingServices/Kinds";
import { coachingOf, readRowOf, whyGroupOf } from "../../src/services/ReadingServices/Coaching";

const full = {
  por_que_nao_converteu: "Achou caro e o consultor não apresentou a bolsa. CPF 123.456.789-09",
  tecnica: 6, persuasao: 4, negociacao: 3, ortografia: 9, agilidade: 5,
  enviou_grade: false, apresentou_proposta: true, fez_followup: false,
  transferencia: true, apresentou_previsao_conclusao: false, apresentou_disciplinas: true,
  melhorar: ["apresentar_bolsa", "enviar_grade", "apresentar_previsao"]
};

describe("avaliação do consultor na leitura da conversa copiada", () => {
  it("a instrução pede a avaliação no mesmo JSON, com os códigos da lista", () => {
    expect(IMPORT_SYSTEM).toMatch(/"avaliacao":\{"por_que_nao_converteu"/);
    Object.keys(IMPROVE).forEach(k => expect(IMPORT_SYSTEM).toContain(k));
    expect(IMPORT_SYSTEM).toMatch(/Nunca escreva valores, bolsas ou prazos/);
  });

  it("resposta completa: notas, sim/não, transferência e pontos a melhorar, sem dados pessoais", () => {
    const a = parseImportAnswer(JSON.stringify({ e_lead: true, situacao: "desistiu", objecao: "preco", avaliacao: full }));
    expect(a.evaluation).toEqual({
      whyNot: expect.any(String),
      notes: { tecnica: 6, persuasao: 4, negociacao: 3, ortografia: 9, agilidade: 5 },
      sentGrade: false, sentProposal: true, followUp: false,
      transfer: true, showedCompletion: false, showedSubjects: true,
      improve: ["apresentar_bolsa", "enviar_grade", "apresentar_previsao"]
    });
    expect(a.evaluation!.whyNot).toMatch(/^Achou caro/);
    expect(a.evaluation!.whyNot).not.toMatch(/123\.456/);
    expect(a.evaluation!.whyNot.length).toBeLessThanOrEqual(160);
  });

  it("parcial: o que falta vira null (sem evidência), nunca um chute", () => {
    const e = parseEvaluation({ tecnica: 7 }, false)!;
    expect(e.notes).toEqual({ tecnica: 7, persuasao: null, negociacao: null, ortografia: null, agilidade: null });
    expect([e.sentGrade, e.sentProposal, e.followUp, e.transfer, e.showedCompletion, e.showedSubjects]).toEqual([null, null, null, null, null, null]);
    expect(e.improve).toEqual([]);
    expect(e.whyNot).toBe("");
  });

  it("notas fora de 0 a 10 são limitadas e arredondadas; texto e booleano não são nota", () => {
    const e = parseEvaluation({ tecnica: 14, persuasao: -3, negociacao: "7", ortografia: 6.6, agilidade: "rápido" }, false)!;
    expect(e.notes).toEqual({ tecnica: 10, persuasao: 0, negociacao: 7, ortografia: 7, agilidade: null });
    expect(parseEvaluation({ tecnica: true, persuasao: "", negociacao: null }, false)!.notes.tecnica).toBe(null);
  });

  it("códigos desconhecidos saem, repetidos contam uma vez, no máximo 3; sim/não só aceita true e false", () => {
    const e = parseEvaluation({ melhorar: ["inventado", "followup", "followup", "ortografia", "tratar_objecao", "responder_rapido"], enviou_grade: "sim", fez_followup: 1 }, false)!;
    expect(e.improve).toEqual(["followup", "ortografia", "tratar_objecao"]);
    expect(e.sentGrade).toBe(null);
    expect(e.followUp).toBe(null);
  });

  it("previsão e disciplinas só existem na transferência", () => {
    const e = parseEvaluation({ ...full, transferencia: false }, false)!;
    expect(e.transfer).toBe(false);
    expect(e.showedCompletion).toBe(null);
    expect(e.showedSubjects).toBe(null);
    expect(e.improve).toEqual(["apresentar_bolsa", "enviar_grade"]);
  });

  it("matriculado não tem \"por que não converteu\"; quem não é lead não é avaliado; lixo vira null", () => {
    expect(parseImportAnswer(JSON.stringify({ e_lead: true, situacao: "matriculado", avaliacao: full })).evaluation!.whyNot).toBe("");
    expect(parseImportAnswer(JSON.stringify({ e_lead: false, avaliacao: full })).evaluation).toBe(null);
    expect(parseImportAnswer(JSON.stringify({ e_lead: true, contato_tipo: "equipe", avaliacao: full })).evaluation).toBe(null);
    expect(parseImportAnswer(JSON.stringify({ e_lead: true, avaliacao: "ótimo" })).evaluation).toBe(null);
    expect(parseImportAnswer(JSON.stringify({ e_lead: true, avaliacao: [1, 2] })).evaluation).toBe(null);
    // a reading made before the evaluation existed: everything else still works
    const old = parseImportAnswer(JSON.stringify({ e_lead: true, situacao: "em_andamento", melhorar: "Responder mais rápido" }));
    expect(old.evaluation).toBe(null);
    expect(old.improve).toBe("Responder mais rápido");
  });
});

// a reading as completeReading keeps it: the parsed answer plus the action
const kept = (situation: string, evaluation: any, extra: any = {}) => JSON.stringify({ isLead: true, situation, objection: null, ...extra, evaluation, action: "andamento" });
const ev = (over: any = {}) => parseEvaluation({ ...full, ...over }, false);

describe("leitura das conversas: o resumo por consultor", () => {
  it("só leads entram; resultado quebrado ou de colega fica de fora", () => {
    expect(readRowOf(1, 10, JSON.stringify({ isLead: false, situation: "em_andamento" }), false)).toBe(null);
    expect(readRowOf(1, 10, JSON.stringify({ action: "nada", curta: true }), false)).toBe(null);
    expect(readRowOf(1, 10, "{quebrado", false)).toBe(null);
    expect(readRowOf(1, 10, null, false)).toBe(null);
    expect(readRowOf(1, 10, kept("em_andamento", null), true)!.enrolled).toBe(true);
    expect(readRowOf(1, 10, kept("matriculado", null), false)!.enrolled).toBe(true);
  });

  it("as contas: conversão, médias, porcentagens, transferências, pontos a melhorar e por que não converteu", () => {
    const rows = [
      // enrolled, evaluated
      readRowOf(1, 1, kept("matriculado", ev({ tecnica: 9, persuasao: 8, negociacao: 8, ortografia: 10, agilidade: 9, enviou_grade: true, apresentou_proposta: true, fez_followup: true, transferencia: false, melhorar: ["followup"], por_que_nao_converteu: "" })), false),
      // gave up for the price
      readRowOf(1, 2, kept("desistiu", ev({ tecnica: 5, melhorar: ["apresentar_bolsa", "tratar_objecao"], por_que_nao_converteu: "Achou caro" }), { objection: "preco" }), false),
      // stopped answering, a transfer
      readRowOf(1, 3, kept("sem_resposta", ev({ tecnica: 4, persuasao: null, enviou_grade: null, melhorar: ["apresentar_bolsa", "followup"], por_que_nao_converteu: "Parou de responder" })), false),
      // still deciding, read before the evaluation existed
      readRowOf(1, 4, kept("em_andamento", null), false)
    ].filter(Boolean) as any[];
    const c = coachingOf(1, "Ana", rows);
    expect(c).toMatchObject({ userId: 1, name: "Ana", read: 4, evaluated: 3, enrolled: 1, conversion: 25 });
    // tecnica: (9 + 5 + 4) / 3 = 6; persuasao: (8 + 4) / 2 = 6 (the null is no evidence, not a zero)
    expect(c.notes.tecnica).toEqual({ avg: 6, n: 3 });
    expect(c.notes.persuasao).toEqual({ avg: 6, n: 2 });
    expect(c.notes.ortografia).toEqual({ avg: 9.3, n: 3 });
    // the grade: yes in 1 of the 2 that say (the third has no evidence)
    expect(c.sentGrade).toEqual({ pct: 50, yes: 1, n: 2 });
    expect(c.sentProposal).toEqual({ pct: 100, yes: 3, n: 3 });
    expect(c.followUp).toEqual({ pct: 33.3, yes: 1, n: 3 });
    // transfers: the two with transferencia true; the completion never shown, the subjects shown in both
    expect(c.transfers).toBe(2);
    expect(c.showedCompletion).toEqual({ pct: 0, yes: 0, n: 2 });
    expect(c.showedSubjects).toEqual({ pct: 100, yes: 2, n: 2 });
    expect(c.improve.map(i => [i.code, i.n])).toEqual([["apresentar_bolsa", 2], ["followup", 2], ["tratar_objecao", 1]]);
    expect(c.improve[0]).toMatchObject({ label: IMPROVE.apresentar_bolsa.label, how: IMPROVE.apresentar_bolsa.how, leadIds: [2, 3] });
    expect(c.whyNot).toEqual([
      { reason: "Ainda em negociação", n: 1, leadIds: [4], examples: [] },
      { reason: "Preço / mensalidade", n: 1, leadIds: [2], examples: ["Achou caro"] },
      { reason: "Sem resposta", n: 1, leadIds: [3], examples: ["Parou de responder"] }
    ]);
  });

  it("sem conversas lidas: tudo zerado ou null, nada inventado", () => {
    const c = coachingOf(2, "Bia", []);
    expect(c).toMatchObject({ read: 0, evaluated: 0, enrolled: 0, conversion: null, transfers: 0, improve: [], whyNot: [] });
    expect(c.notes.tecnica).toEqual({ avg: null, n: 0 });
    expect(c.sentGrade).toEqual({ pct: null, yes: 0, n: 0 });
  });

  it("no máximo 3 leads de exemplo por ponto; o motivo segue o da Recuperação", () => {
    const rows = [1, 2, 3, 4, 5].map(id => readRowOf(1, id, kept("desistiu", ev({ melhorar: ["ortografia"] }), { objection: "concorrente" }), false)) as any[];
    const c = coachingOf(1, "Caio", rows);
    expect(c.improve[0]).toMatchObject({ code: "ortografia", n: 5, leadIds: [1, 2, 3] });
    expect(c.whyNot[0]).toMatchObject({ reason: "Escolheu outra instituição", n: 5, leadIds: [1, 2, 3] });
    expect(c.whyNot[0].examples.length).toBeLessThanOrEqual(2);
    expect(whyGroupOf({ situation: "em_andamento", objection: "preco" })).toBe("Preço / mensalidade");
    expect(whyGroupOf({ situation: "sem_resposta", objection: null })).toBe("Sem resposta");
  });
});
