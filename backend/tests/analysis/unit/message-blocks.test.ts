import { describe, expect, it } from "vitest";

import { BLOCKS_MAX, BLOCK_MAX, splitIntoBlocks } from "../../../src/services/CommercialServices/Blocks";

describe("an answer goes out in short bubbles, never as a wall of text", () => {
  it("a short answer stays as it is", () => {
    expect(splitIntoBlocks("Olá, Maria! Tudo bem? Qual curso você quer?")).toEqual(["Olá, Maria! Tudo bem? Qual curso você quer?"]);
    expect(splitIntoBlocks("")).toEqual([]);
  });
  it("the paragraphs the writer separated become bubbles, with the question alone at the end", () => {
    const text = "Hoje o curso funciona 100% EAD, com aulas e provas pela plataforma.\n\nCom as mudanças do MEC, a parte prática ainda não tem cronograma definido e eu prefiro não te passar nada incerto.\n\nAté aqui ficou claro?";
    const out = splitIntoBlocks(text);
    expect(out.length).toBeGreaterThanOrEqual(2);
    expect(out[out.length - 1]).toBe("Até aqui ficou claro?");
    expect(out.join(" ")).toContain("100% EAD");
  });
  it("a long single paragraph is cut by sentences, each bubble under the limit", () => {
    const sentence = "O curso tem uma grade pensada para quem trabalha e estuda ao mesmo tempo, com flexibilidade nos horários.";
    const out = splitIntoBlocks(Array(8).fill(sentence).join(" "));
    expect(out.length).toBeGreaterThan(1);
    expect(out.length).toBeLessThanOrEqual(BLOCKS_MAX);
    out.forEach(b => expect(b.length).toBeLessThanOrEqual(650));
  });
  it("never more bubbles than the maximum, and nothing is lost", () => {
    const text = Array.from({ length: 12 }, (_, i) => `Parágrafo número ${i + 1} com um texto razoavelmente longo para não juntar com os vizinhos facilmente aqui.`).join("\n\n");
    const out = splitIntoBlocks(text);
    expect(out.length).toBeLessThanOrEqual(BLOCKS_MAX);
    for (let i = 1; i <= 12; i += 1) expect(out.join(" ")).toContain(`Parágrafo número ${i} `);
  });
  it("text with no punctuation is cut by words", () => {
    const out = splitIntoBlocks(Array(120).fill("palavra").join(" "));
    expect(out.length).toBeGreaterThan(1);
    out.forEach(b => expect(b.length).toBeLessThanOrEqual(650));
  });
  it("a short list stays in one bubble", () => {
    const out = splitIntoBlocks("Os documentos são:\n- RG\n- CPF\n- Histórico escolar");
    expect(out).toHaveLength(1);
  });
});
