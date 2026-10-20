import { describe, expect, it, vi } from "vitest";

// the block builder imports the model of the old chatbot only to convert it; here no database is needed
vi.mock("../../../src/models/ChatbotNode", () => ({ default: {} }));

import { validateGraph } from "../../../src/services/FlowServices/Graph";
import { cleanStage } from "../../../src/services/FlowServices/StageSpec";
import { COMMERCIAL_KB, COMMERCIAL_PERSONA, COMMERCIAL_TEMPLATE_KEY, commercialGraph } from "../../../src/services/CommercialServices/Template";
import { isGreeting, openingText, stageFieldsDone } from "../../../src/services/CommercialServices/Rules";

// The ready agent "Comercial — Graduação" (the run in the simulator, with the funnel moving, is in the end-to-end checks).

describe("the template Comercial — Graduação", () => {
  it("has the key and a persona that forbids inventing", () => {
    expect(COMMERCIAL_TEMPLATE_KEY).toBe("graduacao_comercial_cruzeiro");
    expect(COMMERCIAL_PERSONA.systemPrompt).toMatch(/Nunca invente/);
    expect(COMMERCIAL_PERSONA.forbidden).toMatch(/valor de mensalidade, bolsa/);
  });

  it("has a valid graph: every exit connected, no errors, human names on the blocks", () => {
    const g = commercialGraph();
    const issues = validateGraph(g, { hasAiAgent: true, kind: "agent" });
    expect(issues.filter(i => i.level === "error")).toEqual([]);
    expect(issues.filter(i => i.level === "warning")).toEqual([]);
    g.nodes.filter(n => n.type !== "start").forEach(n => expect(String(n.data?.title || ""), n.id).not.toMatch(/stage_|condition_/));
    expect(g.nodes.filter(n => n.type === "stage").every(n => cleanStage(n.data).hooks.includes("commercial"))).toBe(true);
  });

  it("is laid out: no two blocks on the same place", () => {
    const g = commercialGraph();
    const spots = new Set(g.nodes.map(n => `${(n as any).x}:${(n as any).y}`));
    expect(spots.size).toBe(g.nodes.length);
  });

  it("only seeds the texts that the institution dictated", () => {
    const titles = COMMERCIAL_KB.map(k => k.topic);
    expect(titles).toEqual(expect.arrayContaining(["institutional/tutoring", "institutional/platform", "institutional/internship", "institutional/mec"]));
    // faculty, enrollment documents and recognition were dictated by the institution: only what it said (masters and doctors, the maximum MEC grade)
    expect(titles).toEqual(expect.arrayContaining(["institutional/faculty", "institutional/enrollment", "institutional/recognition"]));
    const faculty = COMMERCIAL_KB.find(k => k.topic === "institutional/faculty")!;
    expect(faculty.content).toMatch(/mestres e doutores/);
    expect(COMMERCIAL_KB.find(k => k.topic === "institutional/recognition")!.content).toMatch(/nota máxima/);
    // no invented percentages: the only ones are the official ones of the Portaria MEC 378/2025 (20, 30, 40)
    COMMERCIAL_KB.forEach(k => expect(k.content).not.toMatch(/Harvard/));
    COMMERCIAL_KB.filter(k => k.topic !== "institutional/mec").forEach(k => expect(k.content).not.toMatch(/\d+ ?%/));
    const mec = COMMERCIAL_KB.find(k => k.topic === "institutional/mec")!;
    (mec.content.match(/\d+ ?%/g) || []).forEach(p => expect(["20%", "30%", "40%"]).toContain(p.replace(/\s/g, "")));
  });
});

describe("the opening is written by the system", () => {
  it("a greeting is recognised, a real question is not", () => {
    ["oi", "Olá, bom dia", "quero mais informações", "tenho interesse"].forEach(t => expect(isGreeting(t), t).toBe(true));
    ["qual o valor?", "quanto tempo dura Administração?", "quero falar com uma pessoa", "vocês têm Pedagogia em Porto Velho e como funciona a prova?"].forEach(t => expect(isGreeting(t), t).toBe(false));
  });

  it("asks only the next thing that is missing and never what is known", () => {
    expect(openingText({}, "Maria", false)).toMatch(/Qual curso/);
    expect(openingText({ courseName: "Administração" }, "Maria", false)).toMatch(/Vi que você tem interesse em Administração/);
    expect(openingText({ courseName: "Administração" }, "Maria", false)).toMatch(/cidade/);
    expect(openingText({ courseName: "Administração", city: "Porto Velho" }, "Maria", false)).toMatch(/primeira graduação/);
    expect(openingText({ courseName: "Administração", city: "Porto Velho", entryType: "transfer" }, "Maria", true)).toMatch(/de novo/);
  });

  it("a stage ends when what it asks for is known", () => {
    const fields = [{ key: "courseName", required: true }, { key: "city", required: true }, { key: "entryType", required: true }];
    expect(stageFieldsDone(fields, { courseName: "Direito", city: "Vilhena" })).toBe(false);
    expect(stageFieldsDone(fields, { courseName: "Direito", city: "Vilhena", entryType: "unknown" })).toBe(false);
    expect(stageFieldsDone(fields, { courseName: "Direito", city: "Vilhena", entryType: "first_degree" })).toBe(true);
  });
});

import { fastIntent, humanReason, retractsBuying } from "../../../src/services/CommercialServices/Rules";

describe("what the person says is read with its negation and its content", () => {
  it("a greeting with content is not only a greeting", () => {
    ["Bom dia, quero Direito em Porto Velho, primeira graduação", "oi, quero saber o valor", "olá, tenho 30 anos e queria fazer Pedagogia", "boa tarde, moro em Vilhena"].forEach(t => expect(isGreeting(t), t).toBe(false));
    ["Bom dia", "oi, tudo bem?", "Olá, boa tarde! Quero mais informações", "oi, tenho interesse", "boa noite, vim pelo instagram", "oi, voltei", "Olá, estou de volta"].forEach(t => expect(isGreeting(t.replace("?", "")), t).toBe(true));
  });
  it("negations undo the request", () => {
    expect(fastIntent("não quero falar com atendente, prefiro por aqui")).toBeNull();
    expect(fastIntent("ainda não quero me matricular")).toBeNull();
    expect(fastIntent("quero falar com um atendente")?.intent).toBe("human");
    expect(fastIntent("quero me matricular")?.intent).toBe("enrollment");
  });
  it("'transferir' does not call a person", () => {
    expect(fastIntent("quero transferir minha faculdade, tenho uma pessoa conhecida que estuda aí")).toBeNull();
    expect(fastIntent("me passa pra um atendente")?.intent).toBe("human");
  });
  it("the person takes back the interest in buying", () => {
    ["não vou me matricular agora", "ainda não decidi", "deixa pra depois", "desisti"].forEach(t => expect(retractsBuying(t), t).toBe(true));
    expect(retractsBuying("quero me matricular")).toBe(false);
  });
  it("unhappy people, payments, legal words, wrong numbers and repeated requests go to a person", () => {
    ["isso é um absurdo", "vou reclamar no procon", "já paguei o boleto", "quero o estorno", "vou chamar meu advogado"].forEach(t => expect(humanReason(t), t).toBe("complaint"));
    expect(humanReason("acho que foi engano, número errado")).toBe("other");
    expect(humanReason("qual o prazo de entrega do diploma", ["qual o prazo de entrega do diploma", "qual o prazo de entrega do diploma"])).toBe("loop");
    expect(humanReason("quero saber a duração do curso")).toBeNull();
  });
});

import { unsafeAnswer } from "../../../src/services/CommercialServices/Guards";

describe("what the agent may never say", () => {
  it("amounts of money in any form", () => {
    ["A mensalidade é R$ 299,90.", "Custa trezentos reais por mês", "Sai em 12x de 99", "Fica 299/mês", "A parcela é de 350", "US$ 50", "mil reais"].forEach(t => expect(unsafeAnswer(t, "").kind, t).toBe("price"));
  });
  it("scholarship and discount percentages, gratuity and promises", () => {
    expect(unsafeAnswer("Você pode ter 40% de bolsa", "").kind).toBe("percent");
    expect(unsafeAnswer("Tem desconto de 20%", "").kind).toBe("percent");
    expect(unsafeAnswer("A matrícula é gratuita", "").kind).toBe("free");
    expect(unsafeAnswer("Sem taxa nenhuma", "").kind).toBe("free");
    expect(unsafeAnswer("Garantimos o aproveitamento das disciplinas", "").kind).toBe("promise");
    expect(unsafeAnswer("Suas disciplinas serão aproveitadas", "").kind).toBe("promise");
  });
  it("numbers, percentages and dates must come from the tools or the approved base of this turn", () => {
    expect(unsafeAnswer("As aulas começam em 03/08.", "").kind).toBe("fact");
    expect(unsafeAnswer("As aulas começam em 03/08.", '{"inicio":"03/08"}')).toEqual({ unsafe: false });
    expect(unsafeAnswer("O curso tem 30% das aulas presenciais.", "").kind).toBe("fact");
    expect(unsafeAnswer("O curso tem 30% das aulas presenciais.", '{"percentualPresencial":30}')).toEqual({ unsafe: false });
    expect(unsafeAnswer("Atendemos das 8h às 18h", "").kind).toBe("fact");
  });
  it("a normal answer passes", () => {
    ["O curso de Direito tem 10 semestres (5 anos) e é semipresencial. Quer ver a grade?", "Ótima escolha! Me conta em qual cidade você mora?", "Vou chamar um consultor para continuar com você."].forEach(t => expect(unsafeAnswer(t, ""), t).toEqual({ unsafe: false }));
  });
});

import { SERVICE_KB, SERVICE_PERSONA, SERVICE_TEMPLATE_KEY, serviceGraph } from "../../../src/services/CommercialServices/ServiceTemplate";

describe("the template Atendimento (tutoria e secretaria)", () => {
  it("has a valid graph with the three destinations and a person as the way out", () => {
    const g = serviceGraph();
    const issues = validateGraph(g, { hasAiAgent: true, kind: "agent" });
    expect(issues.filter(i => i.level === "error")).toEqual([]);
    const transfers = g.nodes.filter(n => n.type === "transfer").map(n => n.data.to);
    expect(transfers).toEqual(expect.arrayContaining(["polo_tutoria", "polo_coordenacao", "polo_sales"]));
    const stage = g.nodes.find(n => n.type === "stage")!;
    expect(cleanStage(stage.data).outcomes.map(o => o.id)).toEqual(["tutoria", "secretaria", "comercial"]);
    // no required field: the stage only leaves by a decision of the AI, never because a form was filled
    expect(cleanStage(stage.data).fields.some(f => f.required)).toBe(false);
  });
  it("never answers academic or money matters itself", () => {
    expect(SERVICE_TEMPLATE_KEY).toBe("atendimento_encaminhamento");
    expect(SERVICE_PERSONA.forbidden).toMatch(/valores/);
    expect(SERVICE_KB.length).toBeGreaterThanOrEqual(3);
    SERVICE_KB.forEach(k => expect(k.content).not.toMatch(/R\$|\d+ ?%/));
  });
});

import { briefOf, suggestedStepOf, scoreOf, temperatureOf, topicsOf } from "../../../src/services/CommercialServices/Rules";
import { nudgeText } from "../../../src/services/CommercialServices/Nudges";
import { defaultSlots } from "../../../src/services/CommercialServices/Slots";

describe("a doubt about trust is a conversation, not a complaint", () => {
  it("'é golpe?' goes to the agent; having been scammed goes to a person", () => {
    expect(humanReason("isso é golpe?", [])).toBeNull();
    expect(humanReason("tenho medo de ser golpe", [])).toBeNull();
    expect(humanReason("eu levei um golpe dessa faculdade", [])).toBe("complaint");
    expect(humanReason("isso é uma fraude", [])).toBe("complaint");
  });

  it("the guide of objections comes with a turn that has one", () => {
    expect(topicsOf("acho caro e tenho medo de golpe")).toContain("institutional/objection");
    expect(topicsOf("moro longe do polo")).not.toContain("institutional/objection");
  });
});

describe("what the lead says about the moment weighs on the score and the temperature", () => {
  const base = { ...defaultSlots(), courseName: "Direito", city: "Porto Velho", entryType: "first_degree", lastInboundAt: "2026-01-01" };

  it("who wants to start now scores more than who is only researching, and is hot", () => {
    const now = scoreOf({ ...base, decisionTimeline: "Quer matricular agora" }, false).score;
    const researching = scoreOf({ ...base, decisionTimeline: "Pesquisando, sem prazo" }, false).score;
    expect(now).toBeGreaterThan(researching);
    expect(temperatureOf({ ...base, decisionTimeline: "Decide esta semana" }, false)).toBe("hot");
    expect(temperatureOf({ ...base, decisionTimeline: "Pesquisando, sem prazo" }, false)).not.toBe("hot");
  });
});

describe("the brief the consultant reads", () => {
  const state: any = { leadId: 1, agentId: 1, flowId: 1, temperature: "hot", commercialScore: 70, readyForProposal: false, nextAction: "answer_objection", lastIntent: "objection", followUpReason: null, followUpAt: null, summary: null, stageKey: null, lastNoteHash: null,
    slots: { ...defaultSlots(), leadName: "Paulo", courseName: "Direito", city: "Vilhena", entryType: "first_degree", decisionTimeline: "Decide esta semana", shift: "Noite", bestTime: "2030-05-06 14:00", objectionsSeen: "preco,confianca", readyForConsultant: true } };

  it("brings the origin, what the lead told, the objections, the last words and the next step", () => {
    const text = briefOf(state, { source: "Site · campanha Vestibular", lastMessages: ["e se eu não conseguir pagar?"] });
    expect(text).toMatch(/PRONTO PARA O CONSULTOR/);
    expect(text).toMatch(/Origem: Site · campanha Vestibular/);
    expect(text).toMatch(/Pretende decidir: Decide esta semana/);
    expect(text).toMatch(/Turno: Noite/);
    expect(text).toMatch(/Melhor horário para falar: 2030-05-06 14:00/);
    expect(text).toMatch(/Tipos de objeção: preço, confiança/);
    expect(text).toMatch(/“e se eu não conseguir pagar\?”/);
    expect(text).toMatch(/Próximo passo sugerido ao consultor:\nFalar com o lead em 06\/05 às 14:00/);
  });

  it("without a day, the suggestion follows the moment", () => {
    expect(suggestedStepOf({ ...state, slots: { ...state.slots, bestTime: null, objectionsSeen: "" } })).toMatch(/Chamar o lead, confirmar o interesse em Direito/);
    expect(suggestedStepOf({ ...state, readyForProposal: true })).toMatch(/gerar a proposta de Direito/);
  });
});

describe("reminders to a lead who went silent", () => {
  it("two short, friendly texts that never talk money", () => {
    const one = nudgeText(0, "Paulo", "Direito");
    const two = nudgeText(1, "Paulo", "Direito");
    expect(one).toMatch(/Oi, Paulo!/);
    expect(two).toMatch(/consultor do seu polo/);
    [one, two].forEach(t => expect(t).not.toMatch(/R\$|\d+ ?%|bolsa|desconto|valor/i));
  });
});
