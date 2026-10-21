import { describe, expect, it } from "vitest";
import { acceptsOffer, declinesOffer, gradeResolved, nextStep, offersGrade, pendingSteps, stepLine } from "../../../src/services/CommercialServices/Journey";
import { gradeRequest, humanReason, nextActionOf, readyForConsultantOf, supportIntent, fastIntent } from "../../../src/services/CommercialServices/Rules";
import { blankState } from "../../../src/services/CommercialServices/Slots";

const known = { courseName: "Pedagogia", courseId: 7, city: "Vilhena", entryType: "first_degree", courseExplained: true };

describe("the script the agent follows", () => {
  it("asks for the data first, then presents the course, then offers the grade", () => {
    expect(nextStep({}).key).toBe("qualify");
    expect(nextStep({ ...known, courseExplained: false }).key).toBe("present_course");
    expect(nextStep(known).key).toBe("offer_grade");
    expect(stepLine(known)).toMatch(/Próximo passo obrigatório: .*grade curricular .* Pedagogia/);
  });

  it("the grade is settled when sent, when a person was asked to send it, or when the lead said no", () => {
    expect(gradeResolved(known)).toBe(false);
    [{ gradeSent: true }, { gradeUnavailable: true }, { gradeDeclined: true }].forEach(p => expect(gradeResolved({ ...known, ...p })).toBe(true));
    expect(nextStep({ ...known, gradeSent: true }).key).toBe("consultant");
  });

  it("after the offer it waits for the answer; a transfer lead then owes the transcript", () => {
    expect(nextStep({ ...known, pendingOffer: "grade" }).key).toBe("answer_offer");
    const transfer = { ...known, entryType: "transfer", gradeSent: true };
    expect(nextStep(transfer).key).toBe("transcript");
    expect(pendingSteps(transfer)).toEqual(["transcript"]);
    expect(nextStep({ ...transfer, hasTranscript: true, analysisStatus: "completed" }).key).toBe("analysis");
  });

  it("the next action of the CRM is to send the grade while it is not settled", () => {
    const s = blankState(1);
    s.slots = { ...s.slots, ...known, modalityExplained: true };
    expect(nextActionOf(s)).toBe("send_curriculum");
    s.slots.gradeSent = true;
    expect(nextActionOf(s)).toBe("answer_objection");
  });
});

describe("a qualified lead does not reach the consultant without the grade", () => {
  const data = { ...known, fullName: "Paulo Souza Lima", cpfGiven: true };
  it("waits for the grade, unless a person was asked to send it", () => {
    expect(readyForConsultantOf(data, 2)).toBe(false);
    expect(readyForConsultantOf({ ...data, gradeSent: true }, 2)).toBe(true);
    expect(readyForConsultantOf({ ...data, gradeUnavailable: true }, 2)).toBe(true);
  });
  it("never forever: a few more answers and the system sends it on the way out", () => {
    expect(readyForConsultantOf(data, 5)).toBe(true);
  });
});

describe("short answers to the offer of the grade", () => {
  it("understands yes and no", () => {
    ["sim", "Sim!", "pode mandar", "quero", "quero sim", "claro", "manda", "ok", "por favor", "pode sim"].forEach(t => expect(acceptsOffer(t), t).toBe(true));
    ["não", "agora não", "sim, mas depois", "não quero", "quanto custa?", "tenho uma dúvida sobre o estágio e o horário das aulas"].forEach(t => expect(acceptsOffer(t), t).toBe(false));
    ["não", "agora não", "depois", "não precisa", "não quero"].forEach(t => expect(declinesOffer(t), t).toBe(true));
    expect(declinesOffer("sim")).toBe(false);
  });
  it("sees that the agent offered the grade in the closing question", () => {
    expect(offersGrade("O curso tem 8 semestres. Quer que eu te envie a grade curricular?")).toBe(true);
    expect(offersGrade("Quer receber o PDF da matriz?")).toBe(true);
    expect(offersGrade("Em qual cidade você mora?")).toBe(false);
    expect(offersGrade("Posso te mandar a grade.")).toBe(false);
  });
});

describe("the request for the grade is recognised in the phrases people really write", () => {
  it("finds the request and the course", () => {
    expect(gradeRequest("Qual a grade de Pedagogia?")).toEqual({ course: "pedagogia" });
    expect(gradeRequest("grade de pedagogia")).toEqual({ course: "pedagogia" });
    expect(gradeRequest("tem grade de enfermagem?")).toEqual({ course: "enfermagem" });
    expect(gradeRequest("quais as matérias do curso de pedagogia?")).toEqual({ course: "pedagogia" });
    expect(gradeRequest("me envia a ementa")).toEqual({ course: null });
    expect(gradeRequest("quero ver a matriz curricular")).toEqual({ course: null });
  });
  it("leaves out what is not a request", () => {
    ["já recebi a grade, obrigado", "não quero a grade agora", "a grade é difícil?", "como funciona a grade?", "oi, tudo bem?", "qual o valor da mensalidade?"].forEach(t => expect(gradeRequest(t), t).toBeNull());
  });
});

describe("what used to take the lead out of the agent by mistake", () => {
  it("a question about the selection process or a document of the lead is not a complaint", () => {
    ["Como é o processo de transferência?", "qual o processo seletivo", "vou enviar o comprovante de residência", "quero cancelar o curso na outra faculdade e me transferir"].forEach(t => expect(humanReason(t), t).toBeNull());
  });
  it("real complaints and payments still go to a person", () => {
    ["vou entrar com processo contra vocês", "já paguei o boleto e nada", "mandei o comprovante de pagamento", "quero cancelar minha matrícula", "isso é um absurdo"].forEach(t => expect(humanReason(t), t).toBe("complaint"));
  });
  it("the transcript and the certificate of a lead who is moving over are for the analysis, not the secretary", () => {
    ["Quero transferir, já tenho o histórico escolar", "tenho o certificado de conclusão do ensino médio", "quero cancelar o curso na outra faculdade e me transferir"].forEach(t => expect(supportIntent(t, false), t).toBeNull());
    expect(supportIntent("preciso do meu histórico escolar", true)).toBe("secretary");
    expect(supportIntent("preciso trancar minha matrícula", false)).toBe("secretary");
  });
  it("having a scholarship somewhere else is not asking for the proposal", () => {
    expect(fastIntent("já tenho bolsa na outra faculdade")).toBeNull();
    expect(fastIntent("tem bolsa?")?.intent).toBe("price");
    expect(fastIntent("quero saber sobre a bolsa")?.intent).toBe("price");
    expect(fastIntent("qual o valor da bolsa")?.intent).toBe("price");
  });
});

import { commercialGraph, refreshStages } from "../../../src/services/CommercialServices/Template";
describe("an agent made before the improvements of the model", () => {
  it("gets the new instructions and tools of the stages and keeps everything else", () => {
    const old = commercialGraph();
    const apresentar = old.nodes.find(n => n.id === "apresentar")!;
    apresentar.data = { ...apresentar.data, instructions: "texto antigo", tools: ["buscar_curso"], title: "Meu título" };
    const mine = { nodes: [...old.nodes, { id: "extra", type: "message", data: { text: "meu bloco" } }], edges: old.edges };
    const r = refreshStages(mine);
    expect(r.changed).toContain("apresentar");
    const after = r.graph.nodes.find(n => n.id === "apresentar")!;
    expect(after.data.instructions).toMatch(/Quer que eu te envie a grade curricular/);
    expect(after.data.tools).toEqual(expect.arrayContaining(["buscar_curso", "buscar_grade", "enviar_material"]));
    expect(after.data.title).toBe("Meu título");
    expect(r.graph.nodes.find(n => n.id === "extra")).toBeTruthy();
    expect(refreshStages(r.graph).changed).toEqual([]);
  });
});
