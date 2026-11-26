import { describe, expect, it } from "vitest";
import { createHash } from "crypto";

import { cleanTokenInput, hashToken, hasScope, newToken, polosOf, prefixOf, sameSecret, scopesOf } from "../../src/helpers/ApiTokens";

const code = (fn: () => unknown): string => { try { fn(); return "ok"; } catch (e: any) { return e.message; } };

describe("tokens da API v1", () => {
  it("guarda só o SHA-256 e mostra só o começo", () => {
    const t = newToken();
    expect(t).toMatch(/^wt_[0-9a-f]{48}$/);
    expect(hashToken(t)).toBe(createHash("sha256").update(t).digest("hex"));
    expect(hashToken(t)).not.toContain(t);
    expect(prefixOf(t)).toBe(t.slice(0, 9));
    expect(sameSecret("abc", "abc")).toBe(true);
    expect(sameSecret("abc", "abd")).toBe(false);
    expect(sameSecret("abc", "abcd")).toBe(false);
  });
  it("cada rota pede o seu escopo; acesso total só para os antigos", () => {
    expect(hasScope(["leads:read"], "leads:read")).toBe(true);
    expect(hasScope(["leads:read"], "messages:send")).toBe(false);
    expect(hasScope(["*"], "messages:send")).toBe(true);
    expect(hasScope([], "leads:read")).toBe(false);
    expect(scopesOf('["leads:read"]')).toEqual(["leads:read"]);
    expect(scopesOf("lixo")).toEqual([]);
    expect(polosOf(null)).toBeNull();
    expect(polosOf("[3, -1, \"x\"]")).toEqual([3]);
  });
  it("um token novo precisa de nome, de permissões conhecidas e de validade de até um ano", () => {
    const now = new Date("2026-11-25T12:00:00Z");
    expect(code(() => cleanTokenInput({ scopes: ["leads:read"] }, now))).toBe("ERR_FIELD_REQUIRED_name");
    expect(code(() => cleanTokenInput({ name: "x" }, now))).toBe("ERR_API_TOKEN_SCOPES");
    expect(code(() => cleanTokenInput({ name: "x", scopes: ["*"] }, now))).toBe("ERR_API_TOKEN_SCOPES");
    expect(code(() => cleanTokenInput({ name: "x", scopes: ["leads:read", "inventado"] }, now))).toBe("ERR_API_TOKEN_SCOPES");
    expect(code(() => cleanTokenInput({ name: "x", scopes: ["leads:read"], expiresInDays: 366 }, now))).toBe("ERR_API_TOKEN_EXPIRY");
    expect(code(() => cleanTokenInput({ name: "x", scopes: ["leads:read"], poloIds: [0] }, now))).toBe("ERR_API_TOKEN_POLOS");
    const ok = cleanTokenInput({ name: " CRM ", scopes: ["leads:read", "leads:read"], poloIds: [2, 2] }, now);
    expect(ok).toEqual({ name: "CRM", scopes: ["leads:read"], poloIds: [2], expiresAt: new Date(now.getTime() + 90 * 86400000) });
    expect(cleanTokenInput({ name: "x", scopes: ["indicators:read"], poloIds: [] }, now).poloIds).toBeNull();
  });
});

describe("escopo insights:write", () => {
  it("é um escopo conhecido: o token novo pode ter só ele; os antigos de acesso total também gravam", () => {
    const now = new Date("2026-11-25T12:00:00Z");
    expect(cleanTokenInput({ name: "OpenBot", scopes: ["insights:write", "indicators:read"] }, now).scopes).toEqual(["insights:write", "indicators:read"]);
    expect(hasScope(["insights:write"], "insights:write")).toBe(true);
    expect(hasScope(["indicators:read"], "insights:write")).toBe(false);
    expect(hasScope(["insights:write"], "indicators:read")).toBe(false);
    expect(hasScope(["*"], "insights:write")).toBe(true);
  });
});
