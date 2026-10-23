import { describe, expect, it } from "vitest";
import { MAX_EXAMPLES, formatTraining, parseJson, parseProposals } from "../../../src/services/AiServices/TrainingText";

describe("the lessons of the trainer in the prompt", () => {
  it("is empty when nothing was taught", () => {
    expect(formatTraining([])).toBe("");
  });

  it("numbers the rules, lists the style and the examples, and says the owner's rules win", () => {
    const text = formatTraining([
      { kind: "regra", text: "Nunca fale preço antes de saber o curso" },
      { kind: "regra", text: "Responda em no máximo duas frases" },
      { kind: "estilo", text: "Tom acolhedor, sem emoji" },
      { kind: "exemplo", text: "Cliente: quanto custa?\nResposta: Qual curso te interessa?" }
    ]);
    expect(text).toMatch(/siga à risca/);
    expect(text).toMatch(/vale o que está aqui/);
    expect(text).toContain("1. Nunca fale preço antes de saber o curso");
    expect(text).toContain("2. Responda em no máximo duas frases");
    expect(text).toContain("- Tom acolhedor, sem emoji");
    expect(text).toContain("Cliente: quanto custa?");
  });

  it("keeps only the most recent examples so the prompt does not grow without limit", () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ kind: "exemplo", text: `Cliente: p${i}\nResposta: r${i}` }));
    const text = formatTraining(many);
    expect(text).toContain("p11");
    expect(text).not.toContain("p0\n");
    expect((text.match(/Cliente:/g) || []).length).toBe(MAX_EXAMPLES);
  });
});

describe("reading what the model proposed", () => {
  it("reads a JSON object inside a code fence or with words around it", () => {
    expect(parseJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(parseJson('Claro! {"a":2} pronto')).toEqual({ a: 2 });
    expect(parseJson("sem json")).toBeNull();
  });

  it("returns the reply and only valid, non-repeated proposals", () => {
    const out = parseProposals(
      JSON.stringify({
        reply: "Entendi: nunca falar preço.",
        propose: [
          { kind: "regra", text: "Nunca fale preço" },
          { kind: "regra", text: "nunca fale preço" },
          { kind: "invalido", text: "x" },
          { kind: "estilo", text: "" },
          { kind: "exemplo", text: "Cliente: oi\nResposta: Olá!" }
        ]
      })
    );
    expect(out.reply).toBe("Entendi: nunca falar preço.");
    expect(out.proposed.map(p => p.kind)).toEqual(["regra", "exemplo"]);
  });

  it("falls back to the raw text as the reply when the model did not answer in JSON", () => {
    expect(parseProposals("Oi, tudo bem?")).toEqual({ reply: "Oi, tudo bem?", proposed: [] });
  });
});
