import { describe, expect, it, vi } from "vitest";

const st = vi.hoisted(() => ({ sent: [] as string[], queries: [] as string[] }));

vi.mock("../../src/database", () => ({ default: { query: vi.fn(), getDialect: () => "postgres" } }));
vi.mock("../../src/helpers/AppSettings", () => ({ getSetting: vi.fn(async (_k: string, fallback: string) => fallback), setSetting: vi.fn() }));
vi.mock("../../src/models/AiAgent", () => ({ default: { findOne: vi.fn(async () => ({ id: 3, model: "gpt-4o-mini", provider: "openai" })) } }));
vi.mock("../../src/models/ConsultantReview", () => ({ default: { create: vi.fn(async () => ({})), findAll: vi.fn(async () => []) } }));
// the model is simulated: what would go to the OpenAI is kept here
vi.mock("../../src/services/AiServices/RunAiAgent", () => ({
  resolveKey: vi.fn(async () => "sk-test-only"),
  askOnce: vi.fn(async (_agent: any, _key: string, _system: string, user: string) => {
    st.sent.push(user);
    return { text: JSON.stringify({ objections: [{ type: "preco", handled: true }], difficulties: [], skipped: [], note: "ok" }), usage: { total_tokens: 10 } };
  })
}));
vi.mock("../../src/services/AnalyticsServices/AnalyticsService", () => ({
  consultantWhere: "1=1",
  VALID_TICKET: "1=1",
  rows: vi.fn(async (sql: string) => {
    st.queries.push(sql);
    if (/FROM OutboundMessages/.test(sql)) return [{ ticketId: 11, userId: 5, n: 6 }];
    if (/FROM Messages m/.test(sql)) {
      // newest first, as the query orders them
      return [
        { body: "Fechado então, obrigada!", fromMe: false, mediaType: "chat", mediaUrl: null, transcript: null },
        { body: "v2.ogg", fromMe: true, mediaType: "audio", mediaUrl: "v2.ogg", transcript: "Joana, a bolsa deixa a mensalidade em conta. Me passa seu email joana@exemplo.com" },
        { body: "v1.ogg", fromMe: false, mediaType: "audio", mediaUrl: "v1.ogg", transcript: "Sou a Joana Lima, CPF 123.456.789-09, achei a mensalidade cara" },
        { body: "Oi, Joana! Sou o Carlos, consultor.", fromMe: true, mediaType: "chat", mediaUrl: null, transcript: null },
        { body: "v0.ogg", fromMe: false, mediaType: "ptt", mediaUrl: null, transcript: null }
      ];
    }
    if (/FROM Tickets t JOIN Contacts/.test(sql)) return [{ contact: "Joana Lima", consultant: "Carlos Mendes", leadId: 9, lead: "Joana Lima" }];
    return [];
  })
}));

import { reviewDay } from "../../src/services/AnalyticsServices/ConsultantReview";

describe("revisão diária do consultor com áudio", () => {
  it("a IA recebe o texto dos áudios (do lead e do consultor), sem nomes, CPF nem e-mail; o áudio sem transcrição vira marcador", async () => {
    const run = await reviewDay("2026-11-24", [{ key: "proposal", label: "Proposta" }]);
    expect(run.reviewed).toBe(1);
    expect(st.queries.find(q => /FROM Messages m/.test(q))).toMatch(/m\.transcript/);
    const user = st.sent[0];
    expect(user).toContain("Interessado: [áudio] Sou a [NOME] [NOME], CPF [CPF], achei a mensalidade cara");
    expect(user).toContain("Consultor: [áudio] [NOME], a bolsa deixa a mensalidade em conta.");
    expect(user).toContain("Interessado: [áudio sem transcrição]");
    expect(user).not.toMatch(/Joana|Lima|Carlos|123\.456|joana@exemplo|v1\.ogg|v2\.ogg/);
    // the oldest first, as the conversation happened
    expect(user.indexOf("[áudio sem transcrição]")).toBeLessThan(user.indexOf("Fechado então"));
  });
});
