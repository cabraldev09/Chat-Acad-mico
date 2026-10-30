import { describe, expect, it, vi } from "vitest";

// the state of the lead is read and saved by the models; here only the rules of the conversation are checked
vi.mock("../../../src/models/Course", () => ({ default: {} }));
vi.mock("../../../src/models/Lead", () => ({ default: {} }));
vi.mock("../../../src/models/LeadCommercial", () => ({ default: {} }));
vi.mock("../../../src/models/Polo", () => ({ default: {} }));

import { QUESTIONS, entryOf, isGreeting, needsBolsaData, nextQuestionOf, openingText, withoutClosingQuestion } from "../../../src/services/CommercialServices/Rules";
import { blankState, startConversation } from "../../../src/services/CommercialServices/Slots";

// The commercial process in order (course → city → kind of entry → course presented → consultant), held by the system and not by the model.

describe("the next question of the process", () => {
  it("asks course, then city, then the kind of entry, and nothing once all are known", () => {
    expect(nextQuestionOf({})).toBe(QUESTIONS.course);
    expect(nextQuestionOf({ courseName: "Direito" })).toBe(QUESTIONS.city);
    expect(nextQuestionOf({ courseName: "Direito", city: "Porto Velho", entryType: "unknown" })).toBe(QUESTIONS.entry);
    expect(nextQuestionOf({ courseName: "Direito", poloId: 3, entryType: "first_degree" })).toBeNull();
  });

  it("respects what the administrator lets the agent ask and what the stage needs", () => {
    expect(nextQuestionOf({}, { course: false })).toBe(QUESTIONS.city);
    expect(nextQuestionOf({ courseName: "Direito" }, { city: false })).toBe(QUESTIONS.entry);
    expect(nextQuestionOf({}, {}, ["entry"])).toBe(QUESTIONS.entry);
    expect(nextQuestionOf({ entryType: "transfer" }, {}, ["entry"])).toBeNull();
  });

  it("the opening asks the same next question", () => {
    expect(openingText({ courseName: "Direito" }, "Ana", false)).toContain(QUESTIONS.city);
  });
});

describe("the kind of entry in the person's words", () => {
  it("first degree, transfer and second degree are read by the system", () => {
    for (const t of ["nunca fiz faculdade", "Primeira graduação", "terminei o ensino médio ano passado", "a primeira", "só tenho o ensino médio", "não tenho faculdade"]) {
      expect(entryOf(t), t).toBe("first_degree");
    }
    expect(entryOf("quero transferir do meu curso")).toBe("transfer");
    expect(entryOf("já tenho uma graduação")).toBe("second_degree");
    expect(entryOf("quero fazer direito")).toBeNull();
    expect(entryOf("")).toBeNull();
  });
});

describe("a repeated hello is a greeting the system answers", () => {
  it("a second oi or an interest without content", () => {
    expect(isGreeting("oi")).toBe(true);
    expect(isGreeting("Oi, tudo bem?")).toBe(false);
    expect(isGreeting("quero saber mais")).toBe(true);
    expect(isGreeting("quero fazer direito")).toBe(false);
  });
});

describe("order of the process", () => {
  it("the full name and the CPF are asked only after the lead is qualified (the grade alone is not enough)", () => {
    expect(needsBolsaData({ courseName: "Direito", gradeSent: true, courseExplained: true })).toBe(false);
    expect(needsBolsaData({ courseName: "Direito", city: "Porto Velho", entryType: "first_degree", courseExplained: true, gradeSent: true })).toBe(true);
  });

  it("the handover of a qualified lead leaves no question hanging", () => {
    expect(withoutClosingQuestion("O curso dura 5 anos. Quer saber das provas?")).toBe("O curso dura 5 anos.");
    expect(withoutClosingQuestion("Quer saber das provas?")).toBe("");
    expect(withoutClosingQuestion("Combinado! O consultor te chama.")).toBe("Combinado! O consultor te chama.");
  });
});

describe("a new conversation starts the progress over, the lead stays", () => {
  const ready = () => {
    const s = blankState(7);
    Object.assign(s.slots, { courseName: "Direito", city: "Porto Velho", entryType: "first_degree", qualifiedReplies: 4, readyForConsultant: true, objectionCount: 2, unknownStreak: 2, bolsaDataAsked: 2, conversationTicketId: 10, lastInboundAt: new Date().toISOString() });
    s.readyForProposal = true;
    return s;
  };

  it("another ticket clears readiness and counters, keeps course, city and entry", () => {
    const s = ready();
    expect(startConversation(s, 11)).toBe(true);
    expect(s.slots).toMatchObject({ qualifiedReplies: 0, readyForConsultant: false, objectionCount: 0, unknownStreak: 0, bolsaDataAsked: 0, conversationTicketId: 11, courseName: "Direito", city: "Porto Velho", entryType: "first_degree" });
    expect(s.readyForProposal).toBe(false);
  });

  it("the same ticket goes on; a day away starts over; an old state without a mark only gets the mark", () => {
    const same = ready();
    expect(startConversation(same, 10)).toBe(false);
    expect(same.slots.qualifiedReplies).toBe(4);
    const away = ready();
    away.slots.lastInboundAt = new Date(Date.now() - 30 * 3600000).toISOString();
    expect(startConversation(away, 10)).toBe(true);
    expect(away.slots.readyForConsultant).toBe(false);
    const old = ready();
    delete old.slots.conversationTicketId;
    expect(startConversation(old, 12)).toBe(false);
    expect(old.slots.conversationTicketId).toBe(12);
    expect(old.slots.qualifiedReplies).toBe(4);
  });
});

import { cityCandidateOf, isQualified, missingOf, modalityTextOf, needsModalityExplanation } from "../../../src/services/CommercialServices/Rules";

describe("semipresencial: format and the MEC rule before the consultant", () => {
  const base = { courseName: "Enfermagem", city: "Porto Velho", entryType: "first_degree", courseExplained: true };
  it("a semipresencial course is not qualified until the format was explained", () => {
    expect(needsModalityExplanation({ ...base, courseModality: "Semipresencial" })).toBe(true);
    expect(isQualified({ ...base, courseModality: "Semipresencial" })).toBe(false);
    expect(missingOf({ ...base, courseModality: "Semipresencial" })).toContain("Formato e regra do MEC explicados");
    expect(isQualified({ ...base, courseModality: "Semipresencial", modalityExplained: true })).toBe(true);
    expect(isQualified({ ...base, courseModality: "EAD" })).toBe(true);
    expect(isQualified({ ...base, courseModality: "EAD", mecImpacted: true })).toBe(false);
  });

  it("the explanation comes from the rule, says what the consultant confirms and asks if it is clear", () => {
    const text = modalityTextOf("Enfermagem", { explicacao: { nacional: { regra: "Cursos desta área podem ser semipresenciais, com pelo menos 40% presencial." }, institucional: { confirmado: ["Há atividades práticas presenciais previstas."] }, naoConfirmado: ["dias"] } })!;
    expect(text).toMatch(/Pela regra do MEC, cursos desta área/);
    expect(text).toMatch(/atividades práticas presenciais/);
    expect(text).toMatch(/o consultor confirma/);
    expect(text).toMatch(/\?$/);
    expect(modalityTextOf("X", {})).toBeNull();
  });
});

describe("the town in the person's words", () => {
  it("after moro em / sou de, or a short answer that is only a name", () => {
    expect(cityCandidateOf("moro em Candeias do Jamari", false)).toBe("Candeias do Jamari");
    expect(cityCandidateOf("Sou de Itapuã do Oeste, quero Direito", true)).toBe("Itapuã do Oeste");
    expect(cityCandidateOf("Ji-Paraná", false)).toBe("Ji-Paraná");
    expect(cityCandidateOf("sim", false)).toBeNull();
    expect(cityCandidateOf("quanto custa?", false)).toBeNull();
    expect(cityCandidateOf("Direito", true)).toBeNull();
    expect(cityCandidateOf("quero fazer uma faculdade de direito à noite", false)).toBeNull();
  });
});
