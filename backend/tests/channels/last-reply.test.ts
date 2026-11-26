import { describe, expect, it } from "vitest";

import { lastReplyOf } from "../../src/services/CommercialServices/LastReply";

const A = (content: string) => ({ role: "assistant", content });
const U = (content: string) => ({ role: "user", content });

describe("a última resposta da IA, inteira", () => {
  it("junta os balões da última resposta", () => {
    expect(lastReplyOf([U("Oi"), A("Na área de saúde temos:"), A("- Biomedicina"), A("Qual deles te interessa?"), U("Quais são os cursos nessa área?")], "Quais são os cursos nessa área?"))
      .toBe("Na área de saúde temos:\n- Biomedicina\nQual deles te interessa?");
  });
  it("a pessoa escreveu enquanto os balões saíam: a mensagem dela fica entre eles e a resposta continua inteira", () => {
    expect(lastReplyOf([U("Oi"), A("Na área de saúde temos:"), U("Quais são os cursos nessa área?"), A("- Biomedicina"), A("Qual deles te interessa?")], "Quais são os cursos nessa área?"))
      .toBe("Na área de saúde temos:\n- Biomedicina\nQual deles te interessa?");
  });
  it("não atravessa uma mensagem anterior da pessoa", () => {
    expect(lastReplyOf([A("Resposta antiga"), U("Outra pergunta"), A("Resposta nova")], "Mais uma")).toBe("Resposta nova");
  });
  it("sem resposta da IA, vazio", () => {
    expect(lastReplyOf([U("Oi")], "Oi")).toBe("");
  });
});
