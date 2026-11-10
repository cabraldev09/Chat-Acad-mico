import { describe, expect, it } from "vitest";

import { blankState, cleanPatch } from "../../../src/services/CommercialServices/Slots";
import { briefOf, canAutoMove, confirmsNoInterest, fastIntent, hashOf, nextActionOf, noteOf, scoreOf, targetStageKey, temperatureOf, topicsOf } from "../../../src/services/CommercialServices/Rules";

const state = (slots: any = {}, extra: any = {}) => ({ ...blankState(1), slots: { ...blankState(1).slots, ...slots }, ...extra });

describe("what is obvious needs no model", () => {
  it("a request for a person is a handoff", () => {
    ["quero falar com uma pessoa", "Quero falar com um atendente", "me passa para um consultor", "falar com consultor", "prefiro uma pessoa de verdade"].forEach(t => expect(fastIntent(t)?.intent).toBe("human"));
  });
  it("a price, a scholarship, an enrollment or a proposal is the moment of the human proposal", () => {
    ["Qual o valor?", "quanto fica por mês?", "tem bolsa?", "Quanto custa o curso", "me manda a proposta", "qual a mensalidade", "quero saber quanto pago"].forEach(t => expect(["price", "proposal"]).toContain(fastIntent(t)?.intent));
    ["quero me matricular", "pode prosseguir", "quero fazer a matrícula"].forEach(t => expect(fastIntent(t)?.intent).toBe("enrollment"));
    expect(fastIntent("me manda a proposta")?.intent).toBe("proposal");
  });
  it("questions about the course are not a price", () => {
    ["Quero Administração.", "quanto tempo dura o curso?", "quantos semestres tem?", "Educação Física ainda é 100% EAD?", "Então vai ser dois dias por semana?", "me manda a grade", "tem estágio?", "quero fazer Pedagogia"].forEach(t => expect(fastIntent(t)).toBeNull());
  });
  it("no interest only counts when the person said it", () => {
    expect(confirmsNoInterest("não tenho interesse, obrigado")).toBe(true);
    expect(confirmsNoInterest("desisti")).toBe(true);
    expect(confirmsNoInterest("não quero EAD, prefiro presencial")).toBe(false);
    expect(confirmsNoInterest("vou pensar")).toBe(false);
  });
  it("a message points to the subject of the knowledge base", () => {
    expect(topicsOf("como funciona a plataforma?")).toContain("institutional/platform");
    expect(topicsOf("tem tutoria?")).toContain("institutional/tutoring");
    expect(topicsOf("os professores são mestres?")).toContain("institutional/faculty");
    expect(topicsOf("posso fazer estágio remunerado?")).toContain("institutional/internship");
    expect(topicsOf("qual a duração")).toEqual([]);
  });
});

describe("score, temperature and next action", () => {
  it("each fact counts once and the score stops at 100", () => {
    const base = { courseId: 5, entryType: "first_degree", city: "Porto Velho", lastInboundAt: "2026-01-01" };
    const a = scoreOf(base, false, "course_duration");
    expect(a.score).toBe(5 + 10 + 10 + 5);
    const b = scoreOf({ ...base, intentsSeen: a.ledger.join(",") }, false, "course_duration");
    expect(b.score).toBe(a.score);
    const c = scoreOf({ ...base, intentsSeen: a.ledger.join(",") }, true, "price");
    expect(c.score).toBe(a.score + 20 + 30);
    const d = scoreOf({ ...base, gradeSent: true, intentsSeen: c.ledger.join(",") }, true, "enrollment");
    expect(d.score).toBe(100);
  });
  it("the temperature follows what the person asked", () => {
    expect(temperatureOf({}, false)).toBe("cold");
    expect(temperatureOf({ intentsSeen: "internship" }, false)).toBe("warm");
    expect(temperatureOf({ intentsSeen: "price" }, false)).toBe("hot");
    expect(temperatureOf({}, true)).toBe("hot");
  });
  it("the next action walks the journey", () => {
    expect(nextActionOf(state({ courseId: 1 }))).toBe("identify_city");
    expect(nextActionOf(state({ courseId: 1, city: "Ji-Paraná" }))).toBe("identify_entry_type");
    expect(nextActionOf(state({ courseId: 1, city: "Ji-Paraná", entryType: "first_degree" }))).toBe("present_course");
    expect(nextActionOf(state({ courseId: 1, city: "X", entryType: "transfer", courseExplained: true, modalityExplained: true }))).toBe("wait_transcript");
    expect(nextActionOf(state({ entryType: "transfer", city: "X", hasTranscript: true, analysisStatus: "in_progress" }))).toBe("wait_analysis");
    expect(nextActionOf(state({ analysisStatus: "completed", city: "X", entryType: "transfer" }))).toBe("explain_analysis");
    expect(nextActionOf(state({}, { readyForProposal: true }))).toBe("generate_proposal");
    expect(nextActionOf(state(), { human: true })).toBe("human_service");
    expect(nextActionOf(state(), { lost: true })).toBe("close_lost");
  });
});

describe("the funnel moves by the state, only forward, and a person owns the lead from the proposal on", () => {
  const ready = { courseId: 1, city: "X", entryType: "first_degree", courseExplained: true };
  it("picks the column", () => {
    expect(targetStageKey(state(), { firstContactSent: true })).toBe("contact_started");
    expect(targetStageKey(state({ lastInboundAt: "x" }), { replied: true })).toBe("in_service");
    expect(targetStageKey(state(ready), {})).toBe("qualified");
    expect(targetStageKey(state({ ...ready, entryType: "transfer" }), {})).toBe("waiting_transcript");
    expect(targetStageKey(state({ ...ready, entryType: "transfer", hasTranscript: true, analysisStatus: "in_progress" }), {})).toBe("curricular_analysis");
    expect(targetStageKey(state({ ...ready, analysisStatus: "completed" }), {})).toBe("analysis_done");
    expect(targetStageKey(state(ready, { readyForProposal: true }), {})).toBe("ready_for_proposal");
    expect(targetStageKey(state(ready), { followUp: true })).toBe("follow_up");
    expect(targetStageKey(state(ready), { human: true })).toBe("human_service");
    expect(targetStageKey(state(ready), { noInterest: true })).toBe("no_interest");
  });
  it("only forward, and never out of a column a person owns", () => {
    expect(canAutoMove("new_lead", "contact_started")).toBe(true);
    expect(canAutoMove("qualified", "in_service")).toBe(false);
    expect(canAutoMove("qualified", "ready_for_proposal")).toBe(true);
    expect(canAutoMove("proposal", "ready_for_proposal")).toBe(false);
    expect(canAutoMove("enrolled", "in_service")).toBe(false);
    expect(canAutoMove("ready_for_proposal", "human_service")).toBe(true);
    expect(canAutoMove("human_service", "qualified")).toBe(false);
    expect(canAutoMove("follow_up", "in_service")).toBe(true);
    expect(canAutoMove(null, "qualified")).toBe(false);
    expect(canAutoMove("qualified", "qualified")).toBe(false);
  });
  it("the agent has no way to enroll: 'enrolled' is never a target", () => {
    const all = [state(), state(ready), state(ready, { readyForProposal: true })];
    all.forEach(s => ["replied", "firstContactSent", "human", "followUp", "noInterest"].forEach(k => expect(targetStageKey(s, { [k]: true } as any)).not.toBe("enrolled")));
  });
});

describe("notes and the handoff brief are built without a model", () => {
  const s = state({ leadName: "David Vieira", phone: "5569999990000", courseName: "Educação Física", city: "Porto Velho", poloName: "Polo Porto Velho", entryType: "first_degree", courseExplained: true, modalityExplained: true, mecExplained: true, mecImpacted: true, gradeSent: true, internshipExplained: true, tutoringExplained: true, mainObjection: "Frequência das práticas" }, { readyForProposal: true, temperature: "hot", commercialScore: 85, lastIntent: "price", nextAction: "generate_proposal" });
  it("the note", () => {
    const n = noteOf(s);
    expect(n).toContain("Lead interessado em Educação Física.");
    expect(n).toContain("Primeira graduação.");
    expect(n).toContain("Mudança do MEC explicada.");
    expect(n).toContain("Objeção principal: Frequência das práticas.");
    expect(hashOf(n)).toBe(hashOf(noteOf(s)));
  });
  it("the brief has what the consultant needs", () => {
    const b = briefOf(s, { stageName: "Pronto para proposta" });
    expect(b.startsWith("LEAD PRONTO PARA PROPOSTA")).toBe(true);
    ["David Vieira", "Educação Física", "Primeira graduação", "Quente", "85", "Perguntou valor", "Gerar a proposta", "Frequência das práticas", "Pronto para proposta"].forEach(t => expect(b).toContain(t));
  });
});

describe("slots", () => {
  it("only known slots, in the right kind", () => {
    const p = cleanPatch({ courseId: "12", entryType: "transfer", analysisStatus: "weird", gradeSent: "true", nope: 1, leadTemperature: "hot", city: "  Ji-Paraná " });
    expect(p).toEqual({ courseId: 12, entryType: "transfer", gradeSent: true, leadTemperature: "hot", city: "Ji-Paraná" });
  });
});

import { gradeRequest } from "../../../src/services/CommercialServices/Rules";
describe("the request for the grade is recognised without a model", () => {
  it("finds the course in the sentence", () => {
    expect(gradeRequest("me envia a grade de pedagogia por favor")).toEqual({ course: "pedagogia" });
    expect(gradeRequest("Quero ver a grade do curso de Enfermagem")).toEqual({ course: "enfermagem" });
    expect(gradeRequest("manda a matriz curricular de Administração")).toEqual({ course: "administracao" });
  });
  it("asks nothing when the course is not in the sentence", () => {
    expect(gradeRequest("pode me enviar a grade?")).toEqual({ course: null });
  });
  it("a question about how it works, the price or any other subject is not the request", () => {
    expect(gradeRequest("como funciona a grade do curso?")).toBeNull();
    expect(gradeRequest("qual o valor da mensalidade")).toBeNull();
    expect(gradeRequest("oi, tudo bem?")).toBeNull();
  });
});
