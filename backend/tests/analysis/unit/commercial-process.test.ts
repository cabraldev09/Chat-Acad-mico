import { describe, expect, it, vi } from "vitest";

// the state of the lead is read and saved by the models; here only the rules of the conversation are checked
vi.mock("../../../src/models/Course", () => ({ default: {} }));
vi.mock("../../../src/models/Lead", () => ({ default: {} }));
vi.mock("../../../src/models/LeadCommercial", () => ({ default: {} }));
vi.mock("../../../src/models/Polo", () => ({ default: {} }));

import { bolsaRequestFor } from "../../../src/services/CommercialServices/BolsaData";
import { cleanCommercial } from "../../../src/services/CommercialServices/Config";
import { areaOf, mecRequirementOf } from "../../../src/services/CommercialServices/MecAreas";
import { QUESTIONS, entryOf, isGreeting, needsBolsaData, nextQuestionOf, openingText, withoutClosingQuestion } from "../../../src/services/CommercialServices/Rules";
import { blankState, startConversation } from "../../../src/services/CommercialServices/Slots";

// The commercial process in order (course → city → kind of entry → course presented → consultant), held by the system and not by the model.

describe("the next question of the process", () => {
  it("asks first whether it is the first degree, then course, then city, and nothing once all are known", () => {
    expect(nextQuestionOf({})).toBe(QUESTIONS.entry);
    expect(nextQuestionOf({ courseName: "Direito" })).toBe(QUESTIONS.entry);
    expect(nextQuestionOf({ entryType: "first_degree" })).toBe(QUESTIONS.course);
    expect(nextQuestionOf({ courseName: "Direito", entryType: "first_degree" })).toBe(QUESTIONS.city);
    expect(nextQuestionOf({ courseName: "Direito", city: "Porto Velho", entryType: "unknown" })).toBe(QUESTIONS.entry);
    expect(nextQuestionOf({ courseName: "Direito", poloId: 3, entryType: "first_degree" })).toBeNull();
  });

  it("respects what the administrator lets the agent ask and what the stage needs", () => {
    expect(nextQuestionOf({}, { course: false, entry: false })).toBe(QUESTIONS.city);
    expect(nextQuestionOf({ courseName: "Direito" }, { city: false })).toBe(QUESTIONS.entry);
    expect(nextQuestionOf({ courseName: "Direito" }, { entry: false })).toBe(QUESTIONS.city);
    expect(nextQuestionOf({}, {}, ["entry"])).toBe(QUESTIONS.entry);
    expect(nextQuestionOf({ entryType: "transfer" }, {}, ["entry"])).toBeNull();
  });

  it("the opening asks the same next question", () => {
    expect(openingText({ courseName: "Direito" }, "Ana", false)).toContain(QUESTIONS.entry);
    expect(openingText({ courseName: "Direito", entryType: "first_degree" }, "Ana", false)).toContain(QUESTIONS.city);
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

import { cityCandidateOf, isQualified, missingOf, entryAnswer, modalityQuestion, modalityTextOf, needsModalityExplanation, proceeds, readyForConsultantOf } from "../../../src/services/CommercialServices/Rules";

describe("semipresencial: format and the MEC rule before the consultant", () => {
  const base = { courseName: "Enfermagem", city: "Porto Velho", entryType: "first_degree", courseExplained: true };
  it("a semipresencial course does not go to the consultant until the format was explained (the funnel column is not held)", () => {
    expect(needsModalityExplanation({ ...base, courseModality: "Semipresencial" })).toBe(true);
    expect(isQualified({ ...base, courseModality: "Semipresencial" })).toBe(true);
    expect(readyForConsultantOf({ ...base, courseModality: "Semipresencial", bolsaDataAsked: 2 }, 5)).toBe(false);
    expect(missingOf({ ...base, courseModality: "Semipresencial" })).toContain("Formato e regra do MEC explicados");
    expect(readyForConsultantOf({ ...base, courseModality: "Semipresencial", modalityExplained: true, bolsaDataAsked: 2 }, 5)).toBe(true);
    expect(readyForConsultantOf({ ...base, courseModality: "EAD", bolsaDataAsked: 2 }, 5)).toBe(true);
    expect(readyForConsultantOf({ ...base, courseModality: "EAD", mecImpacted: true, bolsaDataAsked: 2 }, 5)).toBe(false);
  });

  it("the team's own words replace the standard of a step of the script, and the standard stays where nothing was written", () => {
    expect(nextQuestionOf({} as any, {}, undefined, { entry: "Você já fez alguma faculdade?" })).toBe("Você já fez alguma faculdade?");
    expect(nextQuestionOf({ entryType: "first_degree" } as any, {}, undefined, { course: "Qual curso te interessa?" })).toBe("Qual curso te interessa?");
    expect(nextQuestionOf({ entryType: "first_degree", courseName: "Pedagogia" } as any, {}, undefined, { city: "Em qual cidade você mora?" })).toBe("Em qual cidade você mora?");
    expect(nextQuestionOf({ entryType: "first_degree", courseName: "Pedagogia" } as any, {}, undefined, {})).toBe(QUESTIONS.city);
    expect(bolsaRequestFor({ name: true, cpf: true }, "Me manda o nome completo e o CPF, por favor.")).toBe("Me manda o nome completo e o CPF, por favor.");
    expect(bolsaRequestFor({ name: false, cpf: true }, "Me manda o nome completo e o CPF, por favor.")).toMatch(/CPF/);
    expect(cleanCommercial({ texts: { city: "  Em qual cidade?  ", entry: 5, bogus: "x" } }).texts).toEqual({ entry: "5", course: "", city: "Em qual cidade?", doubts: "", bolsa: "", handoff: "" });
  });

  it("a course the Portaria does not restrict is EAD with no practical classes: duration comes before, the format says so and the follow-up is told", () => {
    const ead = modalityTextOf("Empreendedorismo", { mecImpactado: false, explicacao: { area: "livre", turma: null } })!;
    expect(ead).toMatch(/^O curso de \*Empreendedorismo\* é ofertado no formato \*EAD\*, sem aulas práticas presenciais/);
    expect(ead).toMatch(/pela plataforma, pelo celular ou computador/);
    expect(ead).toMatch(/acompanhamento acadêmico durante todo o curso e a tutoria desde a matrícula/);
    expect(ead).toMatch(/professores mestres e doutores/);
    expect(ead).toMatch(/Até aqui você compreendeu\?$/);
    // the old promise of a small presential part is gone
    expect(ead).not.toMatch(/pequena parte|avaliações presenciais/);
  });

  it("what the MEC asks of each course, in one place", () => {
    const livre = mecRequirementOf(areaOf("Empreendedorismo", "Tecnológico", "EAD"));
    expect(livre).toMatchObject({ exigencia: "livre", formato: "EAD", semPratica: true, percentualPresencial: null });
    expect(livre.resumo).toMatch(/EAD: sem aulas práticas/);
    const saude = mecRequirementOf(areaOf("Biomedicina", "Bacharelado", null));
    expect(saude).toMatchObject({ exigencia: "semipresencial", formato: "Semipresencial", percentualPresencial: 40, percentualSincrono: 20, semPratica: false });
    expect(mecRequirementOf(areaOf("Biomedicina", "Bacharelado", null), { percentualPresencial: "30.00" }).percentualPresencial).toBe(30);
    expect(mecRequirementOf(areaOf("Pedagogia", "Licenciatura", null))).toMatchObject({ exigencia: "semipresencial", percentualPresencial: 30 });
    expect(mecRequirementOf(areaOf("Direito", "Bacharelado", null))).toMatchObject({ exigencia: "presencial", formato: "Presencial", percentualPresencial: 70 });
    // a course the Portaria does not name, registered by the team with a presential share, is explained with it
    expect(mecRequirementOf("livre", { mecImpacted: true, percentualPresencial: 25 })).toMatchObject({ exigencia: "semipresencial", percentualPresencial: 25 });
  });

  it("the explanation is the one of the team: today, the change of the MEC until May 2027 with the share of the course, what is not defined yet", () => {
    const saude = modalityTextOf("Biomedicina", { mecImpactado: true, percentualPresencial: 30, explicacao: { area: "saude_eng_agro", turma: null } })!;
    expect(saude).toMatch(/^Hoje, o curso funciona no formato EAD: aulas, atividades, provas e acompanhamento acontecem pela plataforma/);
    expect(saude).toMatch(/os cursos da área da saúde, engenharias e agrárias estão passando por adequações/);
    expect(saude).toMatch(/previsto até maio de 2027, o formato deverá mudar: a parte teórica será realizada ao vivo, com professor e turma/);
    expect(saude).toMatch(/30% de carga prática presencial, em laboratório/);
    expect(saude).toMatch(/na própria cidade ou no polo mais próximo/);
    expect(saude).toMatch(/A quantidade exata de aulas presenciais ainda não foi definida/);
    expect(saude).toMatch(/Até aqui você compreendeu\?$/);
    expect(saude).not.toMatch(/\p{Extended_Pictographic}/u);
    // the share is the one of the course; without one, no number is said
    const lic = modalityTextOf("Pedagogia", { mecImpactado: true, percentualPresencial: null, explicacao: { area: "educacao_ciencias", turma: null } })!;
    expect(lic).toMatch(/as licenciaturas estão passando por adequações/);
    expect(lic).toMatch(/uma parte de atividades presenciais/);
    expect(lic).not.toMatch(/\d+%/);
    // what the class confirmed replaces "not defined yet"; a text of the team for the course replaces everything
    const turma = modalityTextOf("Pedagogia", { mecImpactado: true, percentualPresencial: 30, explicacao: { area: "educacao_ciencias", turma: { presencialStart: "2027-03-01" } } })!;
    expect(turma).toMatch(/começam em 01\/03\/2027/);
    expect(turma).not.toMatch(/ainda não foi definida/);
    expect(modalityTextOf("Pedagogia", { commercialApprovedText: "Texto da equipe para Pedagogia.", explicacao: { area: "educacao_ciencias" } })).toBe("Texto da equipe para Pedagogia.\n\nAté aqui você compreendeu?");
    expect(modalityTextOf("X", {})).toBeNull();
  });

  it("the question about the format and the end of the doubts are read by the system", () => {
    for (const t of ["entendi, e é 100% ead?", "é online?", "tem aula presencial?", "preciso ir ao polo?", "como funcionam as aulas?", "é semipresencial?"]) expect(modalityQuestion(t), t).toBe(true);
    for (const t of ["quanto custa o semipresencial?", "quero pedagogia", "oi"]) expect(modalityQuestion(t), t).toBe(false);
    for (const t of ["Não tenho dúvidas, pode prosseguir", "Sim, pode continuar", "entendi, sem dúvidas", "tudo certo, pode seguir", "nenhuma dúvida"]) expect(proceeds(t), t).toBe(true);
    for (const t of ["ok", "sim", "tenho uma dúvida sobre o estágio", "pode continuar?"]) expect(proceeds(t), t).toBe(false);
  });

  it("the short answer to the question of the first degree", () => {
    const q = QUESTIONS.entry;
    expect(entryAnswer("sim", q)).toBe("first_degree");
    expect(entryAnswer("Sim, é a primeira", q)).toBe("first_degree");
    expect(entryAnswer("não, já sou formada", q)).toBe("second_degree");
    expect(entryAnswer("comecei outra faculdade e parei", q)).toBe("transfer");
    expect(entryAnswer("sim", "Qual curso você tem interesse?")).toBeNull();
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
