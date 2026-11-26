import { describe, expect, it } from "vitest";

import { CLOSING_PATTERN, isClosingMessage } from "../../../src/helpers/ClosingMessage";

const closes = ["ok", "OK!", "Okk", "Obrigada!!", "muito obrigado", "valeu, até mais", "👍", "🙏🙏", "obrigado 😊", "Combinado.", "ta bom, obrigada", "kkkk", "blz"];
const waits = ["ok, e o valor?", "obrigado, mas quanto custa?", "oi", "bom dia", "Quero saber da bolsa", "ok quando começa", "valeu, e a matrícula?", "", "   "];

describe("mensagem que encerra o assunto", () => {
  it("ok, obrigado, valeu e emoji encerram", () => {
    closes.forEach((t) => expect(isClosingMessage(t), t).toBe(true));
  });
  it("pergunta, cumprimento, assunto novo e mensagem vazia não encerram", () => {
    waits.forEach((t) => expect(isClosingMessage(t), t).toBe(false));
  });
  it("o padrão do SQL não tem aspa simples (vai dentro de uma string SQL)", () => {
    expect(CLOSING_PATTERN.includes("'")).toBe(false);
  });
});
