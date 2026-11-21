import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/database", () => ({
  default: { query: vi.fn(async (sql: string) => { if (sql.includes('"AiUsage"')) throw new Error("lock timeout"); return [[], { rowCount: 0 }]; }) }
}));
vi.mock("../../src/helpers/AppSettings", () => ({ getSetting: vi.fn(), setSetting: vi.fn() }));

import { runRetention, RULES } from "../../src/workers/DataRetention";

describe("limpeza noturna", () => {
  it("informa a tabela que falhou (o dia só conta como feito quando nenhuma falha) e limpa os webhooks já processados", async () => {
    const { trimmed, failed } = await runRetention();
    expect(failed).toEqual(["AiUsage"]);
    expect(trimmed.AgentTurnLogs).toBe(0);
    expect(RULES.some(r => r.table === "MetaWebhookEvents" && /status = 'done'/.test(r.where))).toBe(true);
  });
});
