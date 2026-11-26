import { describe, expect, it } from "vitest";

import { mergeUsage, parseUsage, recordUse, routeKey } from "../../src/helpers/ApiUsage";

describe("uso de cada token da API (para trocar os antigos sem parar integração)", () => {
  it("guarda só o método e a rota, sem números nem consulta", () => {
    expect(routeKey({ method: "get", baseUrl: "/api/v1", path: "/leads/123" })).toBe("GET /api/v1/leads/:id");
    expect(routeKey({ method: "POST", baseUrl: "/api/v1", path: "/messages/send" })).toBe("POST /api/v1/messages/send");
  });
  it("soma as chamadas desde a última gravação e mantém o histórico", () => {
    const req = { method: "GET", baseUrl: "/api/v1", path: "/leads" };
    recordUse("token:7", req);
    recordUse("token:7", req);
    recordUse("token:7", { method: "POST", baseUrl: "/api/v1", path: "/leads" });
    const first = mergeUsage("token:7", null, new Date("2026-11-25T12:00:00Z"));
    expect(first.routes["GET /api/v1/leads"].count).toBe(2);
    expect(first.routes["POST /api/v1/leads"].count).toBe(1);
    recordUse("token:7", req);
    const second = mergeUsage("token:7", JSON.stringify(first), new Date("2026-11-25T13:00:00Z"));
    expect(second.routes["GET /api/v1/leads"]).toEqual({ count: 3, last: "2026-11-25T13:00:00.000Z" });
    expect(second.since).toBe(first.since);
    expect(mergeUsage("token:7", JSON.stringify(second)).routes["GET /api/v1/leads"].count).toBe(3);
    expect(parseUsage("lixo")).toBeNull();
  });
});
