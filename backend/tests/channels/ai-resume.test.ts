import { describe, expect, it } from "vitest";

import { dropClosingQuestion, gapNote, RETURN_GAP_MS } from "../../src/services/AiServices/Resume";

describe("o agente que passa a conversa não deixa pergunta no ar", () => {
  it("tira a pergunta final e mantém os parágrafos", () => {
    const text = "Oi, Vitor! Que bom te ver de novo.\n\nO curso de ADS é 100% EAD.\n\nVocê gostaria de saber mais sobre o curso?";
    expect(dropClosingQuestion(text)).toBe("Oi, Vitor! Que bom te ver de novo.\n\nO curso de ADS é 100% EAD.");
  });
  it("tira a pergunta no fim de um parágrafo e deixa o resto", () => {
    expect(dropClosingQuestion("Anotei tudo, Paulo. Posso te ajudar em mais alguma coisa?")).toBe("Anotei tudo, Paulo.");
  });
  it("uma resposta sem pergunta fica como está", () => {
    expect(dropClosingQuestion("Perfeito, Paulo! Um consultor da equipe continua com você.")).toBe("Perfeito, Paulo! Um consultor da equipe continua com você.");
  });
});

describe("a volta depois de um tempo fica marcada no histórico", () => {
  it("diz quando a pessoa voltou e quanto tempo passou", () => {
    const at = Date.parse("2026-11-23T04:03:00Z");
    expect(gapNote(at - 3 * 86400000, at)).toMatch(/^\[Nova conversa em .+, 3 dias depois da anterior\]$/);
    expect(gapNote(at - 8 * 3600000, at)).toMatch(/8 h depois da anterior\]$/);
  });
  it("só conta como volta depois de 6 horas", () => {
    expect(RETURN_GAP_MS).toBe(6 * 3600 * 1000);
  });
});
