import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/database", () => ({ default: { query: vi.fn(), getDialect: () => "postgres" } }));
import { coachingFrom, parseReviewAnswer, scrub, COACHING_MIN_REVIEWS } from "../../src/services/AnalyticsServices/ConsultantReview";
import { skippedSteps } from "../../src/services/AnalyticsServices/SalesInsights";

const steps = ["course", "entry", "city", "grade", "proposal", "enroll"];
const label = (k: string) => ({ grade: "Grade", proposal: "Proposta" } as Record<string, string>)[k] || k;

describe("revisão diária das conversas pela IA", () => {
  it("tira CPF, telefone (com e sem DDI), e-mail, números longos e os nomes das pessoas do texto que vai para a IA", () => {
    const out = scrub("Oi, sou Maria Souza, CPF 123.456.789-09, fone +55 69 99999-1234 ou 69999991234, email maria@x.com, protocolo 12345678901", ["Maria Souza", "João"]);
    expect(out).not.toMatch(/Maria|Souza|123\.456|99999|maria@x\.com|12345678901/);
    expect(out).toContain("[NOME]");
    expect(out).toContain("[CPF]");
    expect(out).toContain("[EMAIL]");
  });

  it("aceita só tipos de objeção e etapas conhecidos, sem repetir, e recusa uma resposta que não é JSON", () => {
    const parsed = parseReviewAnswer('```json\n{"objections":[{"type":"preco","handled":false},{"type":"preco","handled":true},{"type":"inventada","handled":true},{"type":"tempo","handled":true}],"difficulties":["grade","nao_existe"],"skipped":["proposal","proposal"],"note":"Explicar a bolsa. CPF 123.456.789-09"}\n```', steps);
    expect(parsed.objections).toEqual([{ type: "preco", handled: false }, { type: "tempo", handled: true }]);
    expect(parsed.difficulties).toEqual(["grade"]);
    expect(parsed.skipped).toEqual(["proposal"]);
    expect(parsed.note).not.toContain("123.456");
    expect(() => parseReviewAnswer("não sei", steps)).toThrow("ERR_AI_BAD_ANSWER");
    expect(() => parseReviewAnswer("[1,2]", steps)).toThrow("ERR_AI_BAD_ANSWER");
  });

  it("com poucas conversas não aponta treinamento nenhum (ninguém é acusado por uma amostra pequena)", () => {
    const few = Array.from({ length: COACHING_MIN_REVIEWS - 1 }, () => ({ objections: [{ type: "preco", handled: false }], difficulties: ["grade"], skipped: ["proposal"] }));
    expect(coachingFrom(few, label).items).toEqual([]);
  });

  it("aponta o que se repete: objeção sem resposta, etapa difícil e etapa pulada; e reconhece o que vai bem", () => {
    const reviews = [
      ...Array.from({ length: 4 }, () => ({ objections: [{ type: "preco", handled: false }, { type: "tempo", handled: true }], difficulties: ["grade"], skipped: ["proposal"] })),
      ...Array.from({ length: 4 }, () => ({ objections: [{ type: "tempo", handled: true }], difficulties: [], skipped: [] }))
    ];
    const { items, strengths } = coachingFrom(reviews, label);
    const texts = items.map(i => i.text);
    expect(texts).toContain("Objeção de preço sem resposta adequada em 4 de 4 vezes");
    expect(texts).toContain('Dificuldade na etapa "Grade" em 4 de 8 conversas');
    expect(texts).toContain('Pula a etapa "Proposta" em 4 de 8 conversas');
    expect(strengths).toContain("Responde bem à objeção de falta de tempo (8 de 8)");
  });
});

describe("etapas puladas no processo de vendas", () => {
  const order = steps.map(key => ({ key, label: key }));
  it("é pulada a etapa obrigatória não feita antes de uma etapa posterior feita", () => {
    expect(skippedSteps(order, ["course", "city", "proposal"])).toEqual(["entry", "grade"]);
  });
  it("o que ainda não chegou não conta como pulado, e etapa opcional nunca conta", () => {
    expect(skippedSteps(order, ["course", "entry"])).toEqual([]);
    expect(skippedSteps([...order.slice(0, 2), { key: "city", label: "city", optional: true }, ...order.slice(3)], ["course", "entry", "grade"])).toEqual([]);
  });
});
