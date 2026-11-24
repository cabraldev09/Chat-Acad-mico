import { describe, expect, it, vi } from "vitest";

vi.mock("../../../src/database", () => ({ default: { query: async () => [] } }));
vi.mock("../../../src/helpers/AppSettings", () => ({ getSetting: async (_k: string, fallback = "") => fallback, setSetting: async () => undefined }));
vi.mock("../../../src/models/AiAgent", () => ({ default: {} }));
vi.mock("../../../src/models/Ticket", () => ({ default: {} }));
vi.mock("../../../src/models/TutoringIssue", () => ({ default: {} }));
vi.mock("../../../src/models/User", () => ({ default: {} }));
vi.mock("../../../src/services/NotificationServices/Notify", () => ({ notify: async () => 0 }));
vi.mock("../../../src/models/ConsultantReview", () => ({ default: {} }));

import { KINDS, SYSTEM, parseAuditAnswer } from "../../../src/services/TutoriaServices/Issues";

describe("auditoria da tutoria", () => {
  it("o texto do sistema não vende: só aponta o que ficou pendente, para a coordenação acadêmica", () => {
    expect(SYSTEM).toMatch(/não vende/);
    expect(SYSTEM).toMatch(/coordenação acadêmica/);
    expect(SYSTEM).not.toMatch(/matr[ií]cula de novo|bolsa|desconto/i);
  });

  it("lê a resposta estrita: tipo desconhecido vira outro, resumo curto e sem número, só ids abertos desta conversa", () => {
    const a = parseAuditAnswer(JSON.stringify({
      pendencias: [
        { tipo: "protocolo", resumo: "Chamado aberto no CAA, protocolo 2026112400123, aguardando o setor" },
        { tipo: "venda", resumo: "Algo que não é um tipo conhecido pelo sistema" },
        { tipo: "protocolo", resumo: "Chamado aberto no CAA, protocolo 2026112400123, aguardando o setor" },
        { tipo: "retorno", resumo: "x" }
      ],
      resolvidas: [3, 99, "3"],
      ideia: "Cobrar o setor em 48 horas"
    }), [3, 4]);
    expect(a.pendencias).toHaveLength(2);
    expect(a.pendencias[0].resumo).not.toMatch(/2026112400123/);
    expect(a.pendencias[1].tipo).toBe("outro");
    expect(a.resolvidas).toEqual([3]);
    expect(a.ideia).toBe("Cobrar o setor em 48 horas");
    expect(Object.keys(KINDS)).toContain("protocolo");
  });

  it("resposta quebrada é erro (nada é salvo)", () => {
    expect(() => parseAuditAnswer("não sei", [])).toThrow("ERR_AI_BAD_ANSWER");
    expect(() => parseAuditAnswer("[]", [])).toThrow("ERR_AI_BAD_ANSWER");
    expect(parseAuditAnswer("```json\n{\"pendencias\":[],\"resolvidas\":[],\"ideia\":\"\"}\n```", []).pendencias).toEqual([]);
  });
});
