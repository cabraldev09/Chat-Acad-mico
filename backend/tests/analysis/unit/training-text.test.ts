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

import { exampleText, mergeResults, normalizeResult, stageOfStep } from "../../../src/services/AiServices/TrainingText";

describe("what a file teaches", () => {
  const step = { title: "Descobrir o curso", objective: "Saber qual curso a pessoa quer", say: "Que bom ter você aqui!", ask: "Qual curso te interessa?", collect: ["curso", "cidade"], advanceWhen: "o curso e a cidade estiverem claros" };

  it("keeps only known, well-sized things and accepts the Portuguese names the model sometimes uses", () => {
    const r = normalizeResult({ estilo: ["Fala curto"], etapas: [{ titulo: "Abertura", objetivo: "Cumprimentar" }, { titulo: "" }], conhecimento: [{ titulo: "Duração", conteudo: "4 anos" }, { titulo: "x" }], exemplos: [{ cliente: "oi", resposta: "olá" }] });
    expect(r.style).toEqual(["Fala curto"]);
    expect(r.steps).toHaveLength(1);
    expect(r.steps[0].title).toBe("Abertura");
    expect(r.knowledge).toEqual([{ title: "Duração", content: "4 anos" }]);
    expect(exampleText(r.examples[0])).toBe("Cliente: oi\nResposta: olá");
  });

  it("joins the pieces of a long file without repeating, steps in the order they appeared", () => {
    const a = normalizeResult({ style: ["Fala curto"], steps: [step] });
    const b = normalizeResult({ style: ["fala curto!"], steps: [step, { ...step, title: "Enviar a grade" }] });
    const m = mergeResults([a, b]);
    expect(m.style).toHaveLength(1);
    expect(m.steps.map(s => s.title)).toEqual(["Descobrir o curso", "Enviar a grade"]);
  });

  it("turns a step into the block of the Roteiro: what to say, ask and when to move on, with the data as required fields", () => {
    const d = stageOfStep(step, 0);
    expect(d.title).toBe("1. Descobrir o curso");
    expect(d.instructions).toContain("O que dizer: Que bom ter você aqui!");
    expect(d.instructions).toContain("Só avance quando: o curso e a cidade estiverem claros");
    expect(d.fields.map((f: any) => f.label)).toEqual(["curso", "cidade"]);
    expect(d.fields.every((f: any) => f.required)).toBe(true);
    expect(d.steps).toEqual(["Dizer, no seu jeito: Que bom ter você aqui!", "Perguntar: Qual curso te interessa?", "Descobrir: curso", "Descobrir: cidade", "Confirmar antes de avançar: o curso e a cidade estiverem claros"]);
  });
});
