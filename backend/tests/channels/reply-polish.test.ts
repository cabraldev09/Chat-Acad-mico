import { describe, expect, it } from "vitest";
import { dropRepeatedParagraphs, isHandoffNotice, polishReply, PRICE_SENTENCE } from "../../src/helpers/ReplyPolish";

describe("what the AI writes before it goes out", () => {
  it("the price is told as scholarships and the consultant's simulation, never as a table value", () => {
    const out = polishReply("Aqui estão os cursos.\n\nLembrando que a mensalidade é apenas um valor de tabela e pode variar conforme a proposta.");
    expect(out).toContain(PRICE_SENTENCE);
    expect(out).not.toMatch(/valor de tabela/i);
    expect(out.startsWith("Aqui estão os cursos.")).toBe(true);
  });

  it("drops robotic confirmations and keeps the rest", () => {
    const out = polishReply("Perfeito, Vitor! Sua informação foi salva com sucesso.\n\nUm consultor da equipe vai continuar o atendimento com você.");
    expect(out).not.toMatch(/salva com sucesso/i);
    expect(out).toContain("Perfeito, Vitor!");
    expect(out).toContain("Um consultor da equipe vai continuar");
  });

  it("recognises the handoff notice in its usual forms, and not a normal sentence", () => {
    expect(isHandoffNotice("Claro! Vou chamar um consultor para continuar com você. Um momento, por favor.")).toBe(true);
    expect(isHandoffNotice("Um consultor da equipe vai continuar o atendimento com você.")).toBe(true);
    expect(isHandoffNotice("Nossa equipe vai te enviar a grade do curso agora.")).toBe(false);
    expect(isHandoffNotice("O curso é EAD e tem duração de 4 semestres.")).toBe(false);
  });
});

describe("paragraphs the AI already sent", () => {
  const duration = "O curso de *Análise e desenvolvimento de sistemas* tem duração de *4 semestres*, ou seja, aproximadamente *2 anos*.";
  it("drops a paragraph already sent in the conversation and keeps the rest", () => {
    const out = dropRepeatedParagraphs(`${duration}\n\nVocê tem alguma dúvida sobre a grade do curso que eu possa esclarecer agora para você?`, [`Perfeito.\n\n${duration}`]);
    expect(out).toBe("Você tem alguma dúvida sobre a grade do curso que eu possa esclarecer agora para você?");
  });
  it("sends a paragraph only once inside the same answer, ignoring the bold marks", () => {
    const out = dropRepeatedParagraphs(`${duration}\n\n${duration.replace(/\*/g, "")}\n\nAté aqui você compreendeu?`, []);
    expect(out).toBe(`${duration}\n\nAté aqui você compreendeu?`);
  });
  it("keeps short lines that may come back", () => {
    expect(dropRepeatedParagraphs("Ficou alguma dúvida?", ["Ficou alguma dúvida?"])).toBe("Ficou alguma dúvida?");
  });
});

describe("a copilot suggestion in the middle of the conversation", () => {
  it("does not greet again nor ask the name already known", async () => {
    const { midConversation } = await import("../../src/helpers/ReplyPolish");
    const out = midConversation("Oi, Vitor! Que bom que você entendeu as informações.\n\nSe tiver mais alguma dúvida sobre o curso, é só me falar!\n\nComo posso te chamar?", { nome: "Vitor" });
    expect(out).toBe("Se tiver mais alguma dúvida sobre o curso, é só me falar!");
  });
  it("keeps only the last question", async () => {
    const { midConversation } = await import("../../src/helpers/ReplyPolish");
    expect(midConversation("Ficou alguma dúvida?\n\nPosso seguir com a grade?", {})).toBe("Posso seguir com a grade?");
  });
});

describe("the AI in a conversation already going", () => {
  it("does not open with a greeting again", async () => {
    const { withoutOpeningGreeting } = await import("../../src/helpers/ReplyPolish");
    expect(withoutOpeningGreeting("Oi! Como posso te ajudar hoje? Ficou alguma dúvida sobre a grade?")).toBe("Ficou alguma dúvida sobre a grade?");
    expect(withoutOpeningGreeting("Oi, tudo bem?")).toBe("Oi, tudo bem?");
  });
});

describe("the same question asked again", () => {
  it("still gets an answer when the whole reply was said before", () => {
    const safe = "Essa informação eu preciso confirmar com a equipe antes de te passar, para não te informar nada errado.";
    expect(dropRepeatedParagraphs(safe, [safe])).toBe(safe);
  });
});

describe("a value from the catalogue", () => {
  it("keeps the value, drops the word tabela and tells about the scholarships", () => {
    const out = polishReply("O curso Direito tem mensalidade de tabela de R$ 1300.");
    expect(out).toContain("R$ 1300");
    expect(out).not.toMatch(/tabela/);
    expect(out).toContain(PRICE_SENTENCE);
  });
});

describe("the next question of the process", () => {
  it("may be asked again (only information is not repeated)", () => {
    const q = "Para eu te orientar certinho, qual curso você tem interesse em fazer e em qual cidade você mora hoje?";
    expect(dropRepeatedParagraphs(`Estou por aqui.\n\n${q}`, [q])).toBe(`Estou por aqui.\n\n${q}`);
  });
});
