import { describe, expect, it } from "vitest";

import { findRgm, lostReasonFor, maskLongNumbers, outcomeIdeas, parseImportAnswer, parseOutcomeAnswer } from "../../src/services/ReadingServices/Kinds";

describe("leitura das conversas: o que a resposta do modelo pode dizer", () => {
  it("conversa copiada: lead em andamento com etapa, curso, resumo e próximo passo, sem dados pessoais", () => {
    const a = parseImportAnswer(JSON.stringify({ e_lead: true, situacao: "em_andamento", curso: "Pedagogia", etapa: "proposal", objecao: "preco", motivo: "", resumo: "Quer Pedagogia, pediu a proposta. CPF 123.456.789-09", proximo_passo: "Mandar a proposta" }));
    expect(a).toMatchObject({ isLead: true, situation: "em_andamento", course: "Pedagogia", stage: "proposal", objection: "preco", next: "Mandar a proposta" });
    expect(a.summary).not.toMatch(/123\.456/);
  });
  it("códigos desconhecidos viram o padrão e a etapa só vale para quem está em andamento", () => {
    const a = parseImportAnswer("```json\n{\"e_lead\":true,\"situacao\":\"sumiu\",\"etapa\":\"enrolled\",\"objecao\":\"xyz\"}\n```");
    expect(a.situation).toBe("em_andamento");
    expect(a.stage).toBe("in_service");
    expect(a.objection).toBe(null);
    expect(parseImportAnswer(JSON.stringify({ e_lead: true, situacao: "desistiu", etapa: "proposal" })).stage).toBe(null);
    expect(parseImportAnswer(JSON.stringify({ e_lead: false })).isLead).toBe(false);
  });
  it("guarda onde parou, o que ficou pendente, o que melhorar e o polo citado, curtos e sem dados pessoais", () => {
    const a = parseImportAnswer(JSON.stringify({ e_lead: true, situacao: "sem_resposta", parou_em: "Depois da proposta", pendente: "Mandar a grade do curso. Tel 69 99999-1234", melhorar: "Responder no mesmo dia", polo: "Buritis" }));
    expect(a).toMatchObject({ stalledAt: "Depois da proposta", improve: "Responder no mesmo dia", polo: "Buritis" });
    expect(a.pending).not.toMatch(/99999/);
    expect(parseImportAnswer(JSON.stringify({ e_lead: true, melhorar: "x".repeat(500) })).improve!.length).toBeLessThanOrEqual(140);
    expect(parseImportAnswer(JSON.stringify({ e_lead: true })).stalledAt).toBeFalsy();
  });
  it("resposta quebrada é erro (nada é aplicado)", () => {
    expect(() => parseImportAnswer("não sei")).toThrow("ERR_AI_BAD_ANSWER");
    expect(() => parseOutcomeAnswer("[1,2]")).toThrow("ERR_AI_BAD_ANSWER");
  });
  it("o motivo de perda vem da objeção; parou de responder é \"Sem resposta\"", () => {
    expect(lostReasonFor("preco", "desistiu")).toBe("Preço / mensalidade");
    expect(lostReasonFor("concorrente", "desistiu")).toBe("Escolheu outra instituição");
    expect(lostReasonFor(null, "sem_resposta")).toBe("Sem resposta");
    expect(lostReasonFor(null, "desistiu")).toBe("Desistiu de estudar");
  });
  it("o RGM é lido no código (o modelo nunca vê números)", () => {
    expect(findRgm(["oi", "Meu RGM é 12.345.678-9, consegue ver?"])).toBe("123456789");
    expect(findRgm(["rgm: 2345678"])).toBe("2345678");
    expect(findRgm(["meu telefone 99999-0000"])).toBe(null);
  });
  it("resultado: o que o CRM sabe vale mais que o modelo; só códigos conhecidos", () => {
    const a = parseOutcomeAnswer(JSON.stringify({ resultado: "perdeu", motivo: "Preço / mensalidade", objecoes: ["preco", "nada"], o_que_funcionou: ["grade", "magia"], faltou: ["proposta_no_dia"] }), "matriculou");
    expect(a).toEqual({ outcome: "matriculou", reason: null, objections: ["preco"], worked: ["grade"], missed: ["proposta_no_dia"] });
    expect(parseOutcomeAnswer(JSON.stringify({ resultado: "parou", motivo: "qualquer" })).reason).toBe("Sem resposta");
  });
  it("as ideias saem das contas: o que mais separa matrículas de perdas (sem dados suficientes, nenhuma)", () => {
    const won = Array.from({ length: 6 }, () => ({ outcome: "matriculou", worked: ["grade", "rapidez"], missed: [] }));
    const lost = Array.from({ length: 6 }, (_, i) => ({ outcome: "perdeu", worked: i < 1 ? ["grade"] : ["rapidez"], missed: ["grade"] }));
    const ideas = outcomeIdeas([...won, ...lost]);
    expect(ideas.length).toBe(1);
    expect(ideas[0]).toMatch(/enviou a grade do curso.*100%.*17%/);
    expect(outcomeIdeas(won)).toEqual([]);
  });

  it("o texto que sai para a leitura não leva RGM nem protocolo; preço e data continuam legíveis", () => {
    expect(maskLongNumbers("Interessado: meu RGM é 7654321")).toBe("Interessado: meu RGM é [NUM]");
    expect(maskLongNumbers("protocolo 12.345-6 aberto")).toBe("protocolo [NUM] aberto");
    expect(maskLongNumbers("fica R$ 199,90 com vencimento em 10/02/2027")).toBe("fica R$ 199,90 com vencimento em 10/02/2027");
  });
});
